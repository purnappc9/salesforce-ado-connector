// Azure DevOps JS Client wrapper
const ADO = {
    // Basic Auth with PAT (PAT needs to be base64 encoded as :PAT)
    getAuthHeader: (pat) => {
        return `Basic ${btoa(":" + pat)}`;
    },

    // Common Fetch Options with No Cache
    getFetchOptions: (method, pat, body = null) => {
        const headers = {
            'Authorization': ADO.getAuthHeader(pat),
            'Pragma': 'no-cache',
            'Expires': '0'
        };
        if (body) headers['Content-Type'] = 'application/json';

        return {
            method: method,
            headers: headers,
            body: body ? JSON.stringify(body) : null,
            cache: "no-store"
        };
    },

    // Get Base URL
    getBaseUrl: (org, project) => {
        return `https://dev.azure.com/${org}/${project}/_apis/git`;
    },

    // Check if branch exists
    getBranch: async (config, branchName) => {
        const url = `${ADO.getBaseUrl(config.org, config.project)}/repositories/${config.repo}/refs?filter=heads/${branchName}&api-version=7.0`;
        const response = await fetch(url, ADO.getFetchOptions('GET', config.pat));
        if (!response.ok) throw new Error("Failed to get branch: " + response.statusText);
        const data = await response.json();
        return data.count > 0 ? data.value[0] : null;
    },

    // List all branches
    getBranches: async (config) => {
        const url = `${ADO.getBaseUrl(config.org, config.project)}/repositories/${config.repo}/refs?filter=heads/&api-version=7.0`;
        const response = await fetch(url, ADO.getFetchOptions('GET', config.pat));
        if (!response.ok) throw new Error("Failed to list branches: " + response.statusText);
        const data = await response.json();
        return data.value.map(ref => ref.name.replace('refs/heads/', ''));
    },

    // Create branch from main (or default branch logic - assume main for now if creating new)
    createBranch: async (config, newBranchName, sourceBranchName = 'main') => {
        // First get source branch to find target commit
        const sourceRef = await ADO.getBranch(config, sourceBranchName);
        if (!sourceRef) throw new Error(`Source branch ${sourceBranchName} not found to create new branch.`);

        const url = `${ADO.getBaseUrl(config.org, config.project)}/repositories/${config.repo}/refs?api-version=7.0`;
        const body = [{
            name: `refs/heads/${newBranchName}`,
            oldObjectId: "0000000000000000000000000000000000000000",
            newObjectId: sourceRef.objectId
        }];

        const response = await fetch(url, ADO.getFetchOptions('POST', config.pat, body));

        if (!response.ok) throw new Error("Failed to create branch: " + response.statusText);
        const data = await response.json();
        const result = data.value[0];
        // Normalize to look like a GitRef
        return {
            name: result.name,
            objectId: result.newObjectId,
            url: result.url
        };
    },

    // Get all existing file paths in the branch (metadata only) - Handles Pagination
    getExistingFilePaths: async (config, branchName) => {
        const encodedBranch = encodeURIComponent(branchName);
        const paths = new Map(); // Lowercase Path -> Original Puth
        let continuationToken = null;

        do {
            let url = `${ADO.getBaseUrl(config.org, config.project)}/repositories/${config.repo}/items?recursionLevel=Full&includeContent=false&versionDescriptor.version=${encodedBranch}&versionDescriptor.versionType=branch&api-version=7.0`;

            // Append token if present
            if (continuationToken) {
                url += `&continuationToken=${continuationToken}`;
            }

            const response = await fetch(url, ADO.getFetchOptions('GET', config.pat));

            if (response.status === 404) return new Map();
            if (!response.ok) throw new Error("Failed to list existing files: " + response.statusText);

            const data = await response.json();
            if (data.value) {
                data.value.forEach(item => {
                    if (!item.isFolder) {
                        paths.set(item.path.toLowerCase(), item.path);
                    }
                });
            }

            continuationToken = response.headers.get('x-ms-continuationtoken');

        } while (continuationToken);

        return paths;
    },

    // Get file content
    getFile: async (config, branchName, filePath) => {
        const normalizedPath = filePath.startsWith('/') ? filePath : '/' + filePath;
        const encodedPath = encodeURIComponent(normalizedPath);
        const encodedBranch = encodeURIComponent(branchName);

        const url = `${ADO.getBaseUrl(config.org, config.project)}/repositories/${config.repo}/items?path=${encodedPath}&versionDescriptor.version=${encodedBranch}&versionDescriptor.versionType=branch&includeContent=true&api-version=7.0`;
        const response = await fetch(url, ADO.getFetchOptions('GET', config.pat));

        if (response.status === 404) return null; // File not found
        if (!response.ok) throw new Error("Failed to get file: " + response.statusText);

        try {
            const data = await response.json();
            return data.content; // Content string
        } catch (e) {
            console.warn("ADO.getFile: Failed to parse JSON content. Returning raw text fallback or empty.", e);
            return null;
        }
    },

    // Push changes
    // 'changes' is array of { changeType: 'add'|'edit', item: { path: '/foo.txt' }, newContent: { content: '...', contentType: 'rawtext' } }
    pushCommit: async (config, branchName, oldCommitId, changes, comment = "Salesforce Synced Changes") => {
        const url = `${ADO.getBaseUrl(config.org, config.project)}/repositories/${config.repo}/pushes?api-version=7.0`;

        const body = {
            refUpdates: [{
                name: `refs/heads/${branchName}`,
                oldObjectId: oldCommitId // Important for optimistic concurrency
            }],
            commits: [{
                comment: comment,
                changes: changes,
                author: config.author // { name: "...", email: "..." }
            }]
        };

        const response = await fetch(url, ADO.getFetchOptions('POST', config.pat, body));

        if (!response.ok) {
            const err = await response.text();
            throw new Error(`Failed to push commit: ${response.statusText} - ${err}`);
        }

        return await response.json();
    }
};
