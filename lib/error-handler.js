// Error Handling Utilities
const ErrorHandler = {
    // Retry fetch with exponential backoff
    fetchWithRetry: async (url, options = {}, maxRetries = 3) => {
        let lastError;

        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                if (typeof Logger !== 'undefined' && attempt > 0) {
                    await Logger.info(`Retry attempt ${attempt + 1}/${maxRetries} for ${url}`);
                }

                const response = await fetch(url, options);

                // Don't retry client errors (4xx except 408, 429)
                if (response.status >= 400 && response.status < 500) {
                    if (response.status !== 408 && response.status !== 429) {
                        return response; // Let caller handle client errors
                    }
                }

                // Return successful responses
                if (response.ok || response.status < 500) {
                    return response;
                }

                // Server error, retry
                lastError = new Error(`HTTP ${response.status}: ${response.statusText}`);

            } catch (error) {
                lastError = error;

                if (typeof Logger !== 'undefined') {
                    await Logger.warning(`Network error: ${error.message}. Retrying...`);
                }
            }

            // Wait before retry with exponential backoff
            if (attempt < maxRetries - 1) {
                const delay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
                if (typeof Logger !== 'undefined') {
                    await Logger.debug(`Waiting ${delay}ms before retry...`);
                }
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }

        // All retries failed
        if (typeof Logger !== 'undefined') {
            await Logger.error(`All ${maxRetries} retry attempts failed for ${url}`);
        }
        throw lastError;
    },

    // User-friendly error messages
    ERROR_MESSAGES: {
        // ADO Errors
        'Failed to get branch': 'Could not access the Azure DevOps branch. Please verify:\n• Your PAT has "Code (Read)" permission\n• The branch name is correct\n• You have access to the repository',
        'Failed to create branch': 'Could not create the branch in Azure DevOps. Please verify:\n• Your PAT has "Code (Write)" permission\n• The source branch exists\n• The branch name is valid',
        'Failed to push commit': 'Could not push changes to Azure DevOps. This may be due to:\n• Concurrent updates (retry automatically applied)\n• Insufficient permissions\n• Repository policies blocking the push',
        'Failed to list branches': 'Could not retrieve branches from Azure DevOps. Please check:\n• Your PAT is valid\n• Organization and Project names are correct\n• You have access to the repository',

        // Salesforce Errors
        'No Salesforce session found': 'Please open your Salesforce org in a browser tab and log in, then click the "Reconnect" button.',
        'No valid Salesforce session cookie': 'Salesforce session expired or not found. Please:\n• Log in to your Salesforce org\n• Click "Reconnect" button\n• Ensure popup blockers are disabled',
        'Salesforce Retrieve Failed': 'Failed to retrieve metadata from Salesforce. Please check:\n• Your Salesforce session is still active\n• The package.xml is valid\n• You have permission to access the metadata',

        // Validation Errors
        'Invalid XML format': 'The package.xml content is not valid XML. Please check for:\n• Missing closing tags\n• Special characters that need escaping\n• Proper XML structure',
        'Branch name contains invalid characters': 'Git branch names cannot contain: ~ ^ : ? * [ ] \\\n• Use alphanumeric characters, hyphens, and underscores\n• Cannot start or end with a period',

        // Network Errors
        'NetworkError': 'Network connection failed. Please check your internet connection and try again.',
        'TimeoutError': 'The request timed out. This might be due to:\n• Slow network connection\n• Large metadata package\n• Salesforce or Azure DevOps being slow to respond',

        // Generic
        'UNKNOWN_ERROR': 'An unexpected error occurred. Please try again or check the logs for more details.'
    },

    // Get user-friendly error message
    getUserFriendlyError: (technicalError) => {
        const errorString = technicalError.toString();

        // Try to match known errors
        for (const [key, message] of Object.entries(ErrorHandler.ERROR_MESSAGES)) {
            if (errorString.includes(key)) {
                return message;
            }
        }

        // Check for HTTP status codes
        if (errorString.includes('401')) {
            return 'Authentication failed. Please check your PAT or Salesforce session.';
        }
        if (errorString.includes('403')) {
            return 'Access denied. You may not have permission to perform this action.';
        }
        if (errorString.includes('404')) {
            return 'Resource not found. Please verify the organization, project, repository, and branch names.';
        }
        if (errorString.includes('409')) {
            return 'Conflict detected. Someone else may have updated the branch. The operation will retry automatically.';
        }
        if (errorString.includes('500') || errorString.includes('502') || errorString.includes('503')) {
            return 'Server error. The service may be temporarily unavailable. Please try again in a few moments.';
        }

        // Return technical error if no match
        return errorString;
    },

    // Validate inputs
    validateBranchName: (name) => {
        if (!name || !name.trim()) {
            throw new Error('Branch name cannot be empty');
        }

        const invalid = /[~^:?*\[\]\\]/;
        if (invalid.test(name)) {
            throw new Error('Branch name contains invalid characters');
        }

        if (name.startsWith('.') || name.endsWith('.')) {
            throw new Error('Branch name cannot start or end with a period');
        }

        if (name.includes('..')) {
            throw new Error('Branch name cannot contain consecutive periods');
        }

        return true;
    },

    validateFilePath: (path) => {
        if (!path || !path.trim()) {
            throw new Error('File path cannot be empty');
        }

        // Check for invalid characters
        const invalid = /[<>:"|?*]/;
        if (invalid.test(path)) {
            throw new Error('File path contains invalid characters');
        }

        return true;
    },

    validateXml: (xmlString) => {
        if (!xmlString || !xmlString.trim()) {
            throw new Error('XML content cannot be empty');
        }

        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(xmlString, 'text/xml');
            const parserError = doc.querySelector('parsererror');
            if (parserError) {
                throw new Error('Invalid XML format');
            }
            return true;
        } catch (e) {
            throw new Error('Invalid XML format: ' + e.message);
        }
    },

    validateAdoUrl: (url) => {
        if (!url || !url.trim()) {
            return false;
        }

        const validPatterns = [
            /https:\/\/dev\.azure\.com\/[^\/]+\/[^\/]+\/_git\/[^\/]+/,
            /https:\/\/[^\/]+\.visualstudio\.com\/[^\/]+\/_git\/[^\/]+/
        ];

        return validPatterns.some(pattern => pattern.test(url));
    }
};
