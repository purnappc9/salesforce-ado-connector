// Centralized Logging Utility
const Logger = {
    DEBUG: false, // Set to true for debug logs

    // Log levels
    LEVELS: {
        DEBUG: 'DEBUG',
        INFO: 'INFO',
        SUCCESS: 'SUCCESS',
        WARNING: 'WARNING',
        ERROR: 'ERROR'
    },

    // Current session ID
    currentSessionId: null,

    // Initialize a new sync session
    startSession: async () => {
        Logger.currentSessionId = `session_${Date.now()}`;
        const session = {
            id: Logger.currentSessionId,
            startTime: Date.now(),
            status: 'running',
            logs: []
        };
        await chrome.storage.local.set({ currentSession: session });
        Logger.log('Sync session started', Logger.LEVELS.INFO);
        return Logger.currentSessionId;
    },

    // End the current session
    endSession: async (status = 'completed') => {
        const { currentSession } = await chrome.storage.local.get(['currentSession']);
        if (currentSession) {
            currentSession.status = status;
            currentSession.endTime = Date.now();
            await chrome.storage.local.set({ currentSession });
            Logger.log(`Sync session ${status}`, status === 'completed' ? Logger.LEVELS.SUCCESS : Logger.LEVELS.ERROR);
        }
        // Archive session after 24 hours
        setTimeout(async () => {
            await chrome.storage.local.remove('currentSession');
        }, 24 * 60 * 60 * 1000);
    },

    // Retrieve logs for current session
    getSessionLogs: async () => {
        const { currentSession } = await chrome.storage.local.get(['currentSession']);
        return currentSession ? currentSession.logs : [];
    },
    // Alias for compatibility
    getLogs: async () => { return await Logger.getSessionLogs(); },

    // Log a message
    log: async (message, level = Logger.LEVELS.INFO) => {
        // Skip debug logs if DEBUG is false
        if (level === Logger.LEVELS.DEBUG && !Logger.DEBUG) {
            return;
        }

        const timestamp = new Date().toISOString();
        const logEntry = {
            timestamp,
            level,
            message,
            sessionId: Logger.currentSessionId
        };

        // Get current session
        const { currentSession } = await chrome.storage.local.get(['currentSession']);
        if (currentSession) {
            currentSession.logs = currentSession.logs || [];

            // Limit to 1000 logs
            if (currentSession.logs.length >= 1000) {
                currentSession.logs.shift(); // Remove oldest
            }

            currentSession.logs.push(logEntry);
            currentSession.lastMessage = message; // Store last message for status display
            await chrome.storage.local.set({ currentSession });
        }

        // Console output for debugging
        if (Logger.DEBUG) {
            const consoleMethod = level === Logger.LEVELS.ERROR ? 'error' :
                level === Logger.LEVELS.WARNING ? 'warn' : 'log';
            console[consoleMethod](`[${level}] ${message}`);
        }
    },

    // Convenience methods
    debug: (message) => Logger.log(message, Logger.LEVELS.DEBUG),
    info: (message) => Logger.log(message, Logger.LEVELS.INFO),
    success: (message) => Logger.log(message, Logger.LEVELS.SUCCESS),
    warning: (message) => Logger.log(message, Logger.LEVELS.WARNING),
    error: (message) => Logger.log(message, Logger.LEVELS.ERROR),



    // Clear all logs
    clearLogs: async () => {
        const { currentSession } = await chrome.storage.local.get(['currentSession']);
        if (currentSession) {
            currentSession.logs = [];
            await chrome.storage.local.set({ currentSession });
        }
    },

    // Get current session
    getCurrentSession: async () => {
        const { currentSession } = await chrome.storage.local.get(['currentSession']);
        return currentSession || null;
    }
};
