
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
    csvContent += "Status,Time,Org,Branch,Duration,Message\n";

    // CSV Rows
    jobs.forEach(job => {
        const date = new Date(job.startTime);
        const timeStr = date.toLocaleString().replace(/,/g, ''); // Remove commas to match CSV

        let duration = '';
        if (job.endTime) {
            const diffMs = new Date(job.endTime) - new Date(job.startTime);
            duration = Math.floor(diffMs / 1000) + 's';
        }

        const msg = (job.message || '').replace(/,/g, ' ').replace(/\n/g, ' '); // Clean message

        const row = [
            job.status,
            timeStr,
            job.org,
            job.branch,
            duration,
            msg
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
        let icon = '⏳';
        if (job.status === 'completed') { statusClass = 'status-success'; icon = '✅'; }
        if (job.status === 'failed') { statusClass = 'status-failed'; icon = '❌'; }
        if (job.status === 'cancelled') { statusClass = 'status-cancelled'; icon = '🛑'; }

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

        tr.innerHTML = `
            <td class="${statusClass}">${icon} ${job.status.toUpperCase()}</td>
            <td>${timeStr}</td>
            <td>${job.org || '-'}</td>
            <td>${job.branch || '-'}</td>
            <td>${duration}</td>
            <td style="max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${job.message || ''}">${job.message || '-'}</td>
            <td>
                <button class="btn-action" data-index="${index}">🔍 Details</button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    // Add listeners to Detail buttons
    document.querySelectorAll('.btn-action').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const index = e.target.getAttribute('data-index');
            openJobDetails(jobs[index]);
        });
    });
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
        tabBtns.forEach(b => {
            b.classList.remove('active');
            b.style.fontWeight = 'normal';
            b.style.borderBottom = '1px solid #dee2e6';
            b.style.backgroundColor = '#e9ecef';
        });
        tabContents.forEach(c => c.style.display = 'none');

        // Activate clicked
        btn.classList.add('active');
        btn.style.fontWeight = 'bold';
        btn.style.borderBottom = 'none';
        btn.style.backgroundColor = 'white';
        const targetId = btn.getAttribute('data-tab');
        document.getElementById(targetId).style.display = 'block';
    });
});

function openJobDetails(job) {
    // Reset Tabs
    tabBtns[0].click();

    // Render Logs
    const logContainer = document.getElementById('tab-logs');
    logContainer.innerHTML = '';

    if (job.logs && job.logs.length > 0) {
        job.logs.forEach(log => {
            const div = document.createElement('div');
            // Colorize based on level
            let color = '#f8f9fa';
            if (log.level === 'ERROR') color = '#ff6b6b';
            if (log.level === 'WARNING') color = '#fcc419';
            if (log.level === 'SUCCESS') color = '#51cf66';

            div.style.color = color;
            div.style.borderBottom = '1px solid #343a40';
            div.style.padding = '2px 0';
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
