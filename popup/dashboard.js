
document.addEventListener('DOMContentLoaded', () => {
    loadJobs();

    // Auto-refresh when storage changes (Real-time monitoring)
    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'local' && changes.jobHistory) {
            loadJobs();
        }
    });

    document.getElementById('btn-clear-history').addEventListener('click', () => {
        if (confirm('Are you sure you want to clear all job history? This cannot be undone.')) {
            chrome.storage.local.remove('jobHistory', () => {
                loadJobs();
            });
        }
    });

    document.getElementById('btn-export-csv').addEventListener('click', () => {
        exportHistoryToCSV(false);
    });

    document.getElementById('btn-export-delete').addEventListener('click', () => {
        if (confirm('Download history and PERMANENTLY DELETE it?')) {
            exportHistoryToCSV(true);
        }
    });
});

async function exportHistoryToCSV(deleteAfter) {
    const result = await chrome.storage.local.get(['jobHistory']);
    const jobs = result.jobHistory || [];

    if (jobs.length === 0) {
        alert('No history to export.');
        return;
    }

    // CSV Header
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Status,Time,SfOrg,AdoOrg,Branch,Duration,Message,TestClasses,PackageXml\n";

    // CSV Rows
    jobs.forEach(job => {
        const date = new Date(job.startTime);
        const timeStr = date.toLocaleString().replace(/,/g, '');

        let duration = '';
        if (job.endTime) {
            const diffMs = new Date(job.endTime) - new Date(job.startTime);
            const seconds = Math.floor(diffMs / 1000);
            const minutes = Math.floor(seconds / 60);
            duration = minutes > 0 ? `${minutes}m ${seconds % 60}s` : `${seconds}s`;
        }

        // CSV Escaping Helper
        const safe = (val) => {
            if (!val) return '';
            const str = String(val).replace(/"/g, '""'); // Double quote escape
            return `"${str}"`;
        };

        const row = [
            safe(job.status),
            safe(timeStr),
            safe(job.sfOrg),
            safe(job.org),
            safe(job.branch),
            safe(duration),
            safe(job.message),
            safe(job.testClasses),
            safe(job.packageXml)
        ].join(",");
        csvContent += row + "\n";
    });

    // Trigger Download
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    const timestamp = new Date().toISOString().slice(0, 10);
    link.setAttribute("download", `salesforce_sync_history_${timestamp}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Delete if requested
    if (deleteAfter) {
        chrome.storage.local.remove('jobHistory', () => {
            loadJobs();
        });
    }
}

async function loadJobs() {
    const result = await chrome.storage.local.get(['jobHistory']);
    const jobs = result.jobHistory || [];
    const tbody = document.getElementById('job-list');
    const emptyState = document.getElementById('empty-state');

    tbody.innerHTML = '';

    if (jobs.length === 0) {
        emptyState.style.display = 'block';
        return;
    } else {
        emptyState.style.display = 'none';
    }


    // Sort by Date Descending
    jobs.sort((a, b) => new Date(b.startTime) - new Date(a.startTime));

    jobs.forEach((job, index) => {
        const tr = document.createElement('tr');

        // Status Icon
        let statusClass = 'status-running';
        let icon = '&#8987;'; // Hourglass
        if (job.status === 'completed') { statusClass = 'status-success'; icon = '&#9989;'; } // Check mark
        if (job.status === 'failed') { statusClass = 'status-failed'; icon = '&#10060;'; } // Cross mark
        if (job.status === 'cancelled') { statusClass = 'status-cancelled'; icon = '&#128721;'; } // Stop sign

        // Time Formatting
        const date = new Date(job.startTime);
        const timeStr = date.toLocaleTimeString() + ' ' + date.toLocaleDateString();

        // Duration
        let duration = '...';
        if (job.endTime) {
            const diffMs = new Date(job.endTime) - new Date(job.startTime);
            const seconds = Math.floor(diffMs / 1000);
            const minutes = Math.floor(seconds / 60);
            duration = minutes > 0 ? `${minutes}m ${seconds % 60}s` : `${seconds}s`;
        }

        const cancelButton = job.status === 'running'
            ? `<button class="btn btn-danger btn-sm btn-cancel-job" data-id="${job.id}" style="margin-right: 5px;">&#128721; Cancel</button>`
            : '';

        tr.innerHTML = `
            <td class="${statusClass}">${icon} ${job.status.toUpperCase()}</td>
            <td>${timeStr}</td>
            <td>${job.sfOrg || job.org || '-'}</td>
            <td>${job.branch || '-'}</td>
            <td>${duration}</td>
            <td style="max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${job.message || ''}">${job.message || '-'}</td>
            <td>
                ${cancelButton}
                <button class="btn btn-primary btn-sm" data-index="${index}">&#128269; Details</button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    // Add listeners to Detail buttons
    document.querySelectorAll('.btn-primary').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const index = e.target.getAttribute('data-index');
            if (index !== null) {
                openJobDetails(jobs[index]);
            }
        });
    });

    // Add listeners to Cancel buttons
    document.querySelectorAll('.btn-cancel-job').forEach(btn => {
        btn.addEventListener('click', (e) => {
            if (confirm('Are you sure you want to stop this sync?')) {
                const jobId = e.target.getAttribute('data-id');
                // Send message to parent (popup.js)
                window.parent.postMessage({ type: 'CANCEL_JOB', jobId: jobId }, '*');
            }
        });
    });
}

function openJobDetails(job) {
    // Reset Tabs
    tabBtns.forEach(b => b.classList.remove('active'));
    tabContents.forEach(c => c.style.display = 'none');

    // Default to first tab
    tabBtns[0].classList.add('active');
    document.getElementById('tab-logs').style.display = 'block';

    // Populate Summary
    const summaryDiv = document.getElementById('job-summary-info');
    if (summaryDiv) {
        summaryDiv.innerHTML = `
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 13px;">
                <div><strong>Status:</strong> <span class="${job.status === 'failed' ? 'status-failed' : 'status-success'}">${job.status.toUpperCase()}</span></div>
                <div><strong>Time:</strong> ${new Date(job.startTime).toLocaleString()}</div>
                <div><strong>Salesforce Org:</strong> <a href="${job.sfOrg || '#'}" target="_blank">${job.sfOrg || 'N/A'}</a></div>
                <div><strong>ADO Branch:</strong> ${job.branch || 'N/A'}</div>
                <div style="grid-column: span 2;"><strong>Test Classes:</strong> <span style="font-family: monospace; background: #f0f0f0; padding: 2px 4px; border-radius: 3px;">${job.testClasses || 'None'}</span></div>
            </div>
        `;
    }

    // Render Logs
    const logContainer = document.getElementById('tab-logs');
    logContainer.innerHTML = '';

    if (job.logs && job.logs.length > 0) {
        job.logs.forEach(log => {
            const div = document.createElement('div');
            div.className = 'log-entry';

            // Colorize based on level
            let color = '#343a40'; // Default dark
            if (log.level === 'ERROR') color = '#dc3545';
            if (log.level === 'WARNING') color = '#ffc107';
            if (log.level === 'SUCCESS') color = '#28a745';
            if (log.level === 'INFO') color = '#17a2b8';

            div.style.color = color;
            div.textContent = `[${new Date(log.timestamp).toLocaleTimeString()}] [${log.level}] ${log.message}`;
            logContainer.appendChild(div);
        });
    } else {
        logContainer.textContent = "No log data available (Legacy job or logs cleaned).";
        if (job.message) {
            const div = document.createElement('div');
            div.textContent = `Last Message: ${job.message}`;
            logContainer.appendChild(div);
        }
    }

    // Render Package.xml
    const pkgContainer = document.getElementById('tab-package');
    pkgContainer.textContent = job.packageXml || "No package.xml recorded for this job.";

    // Show Modal
    modal.style.display = 'flex';
}

// --- MODAL LOGIC ---
const modal = document.getElementById('job-details-modal');
const tabBtns = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

document.getElementById('btn-close-modal').addEventListener('click', () => {
    modal.style.display = 'none';
});

// Close on outside click
modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.style.display = 'none';
});

// Tab Switching
tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        // Remove active class
        tabBtns.forEach(b => b.classList.remove('active'));
        tabContents.forEach(c => c.classList.remove('active'));
        tabContents.forEach(c => c.style.display = 'none'); // Reset display

        // Activate clicked
        btn.classList.add('active');
        const targetId = btn.getAttribute('data-tab');
        const content = document.getElementById(targetId);
        content.classList.add('active');
        content.style.display = 'block'; // Show content
    });
});
