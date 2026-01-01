// Logging Page JavaScript
document.addEventListener('DOMContentLoaded', async () => {
    const logsContent = document.getElementById('logs-content');
    const logsContainer = document.getElementById('logs-container');
    const emptyState = document.getElementById('empty-state');
    const statusText = document.getElementById('status-text');
    const statusDot = document.getElementById('status-dot');
    const elapsedTimeEl = document.getElementById('elapsed-time');
    const sessionIdEl = document.getElementById('session-id');
    const visibleCountEl = document.getElementById('visible-count');
    const totalCountEl = document.getElementById('total-count');
    const autoScrollCheckbox = document.getElementById('auto-scroll');

    let currentFilter = 'all';
    let elapsedInterval = null;

    // Load and display logs
    const loadLogs = async () => {
        const session = await Logger.getCurrentSession();

        if (!session || !session.logs || session.logs.length === 0) {
            emptyState.style.display = 'block';
            logsContent.style.display = 'none';
            totalCountEl.textContent = '0';
            visibleCountEl.textContent = '0';
            sessionIdEl.textContent = 'N/A';
            updateStatus('idle');
            return;
        }

        emptyState.style.display = 'none';
        logsContent.style.display = 'block';

        // Update session info
        sessionIdEl.textContent = session.id || 'N/A';
        updateStatus(session.status || 'idle', session.lastMessage);

        // Start/stop elapsed timer
        if (session.status === 'running') {
            startElapsedTimer(session.startTime);
        } else {
            stopElapsedTimer();
            if (session.endTime) {
                updateElapsedTime(session.startTime, session.endTime);
            }
        }

        // Render logs
        renderLogs(session.logs);
    };

    // Render log entries
    const renderLogs = (logs) => {
        logsContent.innerHTML = '';
        let visibleCount = 0;

        logs.forEach(log => {
            const entry = document.createElement('div');
            entry.className = `log-entry ${log.level}`;

            // Apply filter
            if (currentFilter !== 'all' && log.level !== currentFilter) {
                entry.classList.add('hidden');
            } else {
                visibleCount++;
            }

            const timestamp = new Date(log.timestamp).toLocaleTimeString('en-US', {
                hour12: false,
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });

            entry.innerHTML = `
                <span class="log-timestamp">${timestamp}</span>
                <span class="log-level">${log.level}</span>
                <span class="log-message">${escapeHtml(log.message)}</span>
            `;

            logsContent.appendChild(entry);
        });

        totalCountEl.textContent = logs.length;
        visibleCountEl.textContent = visibleCount;

        // Auto-scroll to bottom if enabled
        if (autoScrollCheckbox.checked) {
            logsContainer.scrollTop = logsContainer.scrollHeight;
        }
    };

    // Escape HTML to prevent XSS
    const escapeHtml = (text) => {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    };

    // Update status badge
    const updateStatus = (status, lastMessage) => {
        statusDot.className = `status-dot ${status}`;
        const statusMap = {
            'running': '🔄 Running',
            'completed': '✅ Completed',
            'failed': '❌ Failed',
            'idle': '⏸️ Idle'
        };
        statusText.textContent = statusMap[status] || 'Unknown';

        const detailEl = document.getElementById('status-detail');
        if (lastMessage && status === 'running') {
            // Show last message for active progress
            detailEl.textContent = `— ${lastMessage}`;
        } else {
            detailEl.textContent = '';
        }
    };

    // Start elapsed timer
    const startElapsedTimer = (startTime) => {
        stopElapsedTimer(); // Clear any existing interval

        elapsedInterval = setInterval(() => {
            updateElapsedTime(startTime, Date.now());
        }, 1000);
    };

    // Stop elapsed timer
    const stopElapsedTimer = () => {
        if (elapsedInterval) {
            clearInterval(elapsedInterval);
            elapsedInterval = null;
        }
    };

    // Update elapsed time display
    const updateElapsedTime = (startTime, endTime) => {
        const elapsed = endTime - startTime;
        const seconds = Math.floor(elapsed / 1000) % 60;
        const minutes = Math.floor(elapsed / (1000 * 60)) % 60;
        const hours = Math.floor(elapsed / (1000 * 60 * 60));

        elapsedTimeEl.textContent =
            `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    };

    // Filter buttons
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilter = btn.dataset.filter;
            loadLogs();
        });
    });

    // Copy logs button
    document.getElementById('btn-copy').addEventListener('click', async () => {
        const logs = await Logger.getLogs();
        const logsText = logs.map(log =>
            `[${new Date(log.timestamp).toISOString()}] [${log.level}] ${log.message}`
        ).join('\n');

        try {
            await navigator.clipboard.writeText(logsText);
            alert('Logs copied to clipboard!');
        } catch (e) {
            alert('Failed to copy logs: ' + e.message);
        }
    });

    // Clear logs button
    document.getElementById('btn-clear').addEventListener('click', async () => {
        if (confirm('Are you sure you want to clear all logs?')) {
            await Logger.clearLogs();
            loadLogs();
        }
    });

    // Refresh button
    document.getElementById('btn-refresh').addEventListener('click', () => {
        loadLogs();
    });

    // Listen for storage changes (real-time updates)
    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'local' && changes.currentSession) {
            loadLogs();
        }
    });

    // Initial load
    loadLogs();

    // Auto-refresh every 2 seconds if running
    setInterval(async () => {
        const session = await Logger.getCurrentSession();
        if (session && session.status === 'running') {
            loadLogs();
        }
    }, 2000);

    // Cleanup on page unload
    window.addEventListener('beforeunload', () => {
        stopElapsedTimer();
    });
});
