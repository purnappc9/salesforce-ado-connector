
// IndexedDB helper for storing FileSystemDirectoryHandle
const DB_NAME = 'SalesforceADOConnector';
const DB_VERSION = 1;
const STORE_NAME = 'handles';

function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        };
    });
}

async function saveBackupFolderHandle(handle) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const request = store.put(handle, 'backupFolder');
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

async function getBackupFolderHandle() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const request = store.get('backupFolder');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function clearBackupFolderHandle() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const request = store.delete('backupFolder');
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    // State for mappings
    let typeMappings = {};
    let backupFolderHandle = null;

    // Load saved settings
    const savedConfig = await chrome.storage.local.get([
        'adoOrgs', 'adoProject', 'adoRepo', 'adoPat',
        'sourceBranch', 'targetBranch', 'targetPath', 'testFilePath',
        'packageXml', 'packageXmlPath', 'manualTestClasses', 'typeMappings',
        'gitUser', 'gitEmail', 'commitMessage'
    ]);

    if (savedConfig.adoOrgs) document.getElementById('ado-org').value = savedConfig.adoOrgs;
    if (savedConfig.adoProject) document.getElementById('ado-project').value = savedConfig.adoProject;
    if (savedConfig.adoRepo) document.getElementById('ado-repo').value = savedConfig.adoRepo;
    if (savedConfig.adoPat) document.getElementById('ado-pat').value = savedConfig.adoPat;
    if (savedConfig.gitUser) document.getElementById('git-user').value = savedConfig.gitUser;
    if (savedConfig.gitEmail) document.getElementById('git-email').value = savedConfig.gitEmail;
    if (savedConfig.sourceBranch) document.getElementById('source-branch').value = savedConfig.sourceBranch;
    if (savedConfig.targetBranch) document.getElementById('branch-name').value = savedConfig.targetBranch;
    if (savedConfig.targetPath) document.getElementById('target-path-prefix').value = savedConfig.targetPath;
    if (savedConfig.testFilePath) document.getElementById('test-file-path').value = savedConfig.testFilePath;
    if (savedConfig.packageXml) document.getElementById('package-xml-content').value = savedConfig.packageXml;
    if (savedConfig.packageXmlPath) document.getElementById('package-xml-path').value = savedConfig.packageXmlPath;
    if (savedConfig.manualTestClasses) document.getElementById('manual-test-classes').value = savedConfig.manualTestClasses;
    if (savedConfig.commitMessage) document.getElementById('commit-message').value = savedConfig.commitMessage;
    if (savedConfig.typeMappings) typeMappings = savedConfig.typeMappings;

    // Load backup folder handle
    try {
        const handle = await getBackupFolderHandle();
        if (handle) {
            console.log('Loaded folder handle:', handle.name);
            // Verify it's still accessible
            try {
                const permission = await handle.queryPermission({ mode: 'readwrite' });
                if (permission === 'granted' || permission === 'prompt') {
                    backupFolderHandle = handle;
                    console.log('Folder handle verified and loaded');
                } else {
                    console.log('Permission not granted, clearing handle');
                    await clearBackupFolderHandle();
                }
            } catch (permError) {
                console.error('Error verifying folder permission:', permError);
                await clearBackupFolderHandle();
            }
        } else {
            console.log('No saved folder handle found');
        }
    } catch (e) {
        console.error('Error loading backup folder:', e);
    }

    // Update UI after loading
    await updateBackupFolderUI();

    // Status helper
    const statusDiv = document.getElementById('status');
    const updateStatus = (msg, type = 'info') => {
        statusDiv.textContent = msg;
        statusDiv.className = 'status ' + type;
        console.log(`[${type.toUpperCase()}] ${msg}`);
    };

    // Update Backup Folder UI Display
    async function updateBackupFolderUI() {
        const display = document.getElementById('backup-folder-display');
        if (backupFolderHandle) {
            try {
                // Verify permission
                const permission = await backupFolderHandle.queryPermission({ mode: 'readwrite' });
                if (permission === 'granted') {
                    display.textContent = backupFolderHandle.name || 'Selected Folder';
                    display.title = `Backups will be saved to: ${backupFolderHandle.name}`;
                    display.style.color = '#28a745';
                } else {
                    // Permission lost, prompt to re-request
                    const newPermission = await backupFolderHandle.requestPermission({ mode: 'readwrite' });
                    if (newPermission === 'granted') {
                        display.textContent = backupFolderHandle.name || 'Selected Folder';
                        display.title = `Backups will be saved to: ${backupFolderHandle.name}`;
                        display.style.color = '#28a745';
                    } else {
                        throw new Error('Permission denied');
                    }
                }
            } catch (e) {
                // Handle lost or invalid
                backupFolderHandle = null;
                await clearBackupFolderHandle();
                display.textContent = 'Not Selected (using Downloads)';
                display.title = 'Current backup folder path';
                display.style.color = '';
            }
        } else {
            display.textContent = 'Not Selected (using Downloads)';
            display.title = 'Current backup folder path';
            display.style.color = '';
        }
    }

    const saveConfigToStorage = () => {
        const config = {
            adoOrgs: document.getElementById('ado-org').value,
            adoProject: document.getElementById('ado-project').value,
            adoRepo: document.getElementById('ado-repo').value,
            adoPat: document.getElementById('ado-pat').value,
            gitUser: document.getElementById('git-user').value,
            gitEmail: document.getElementById('git-email').value,
            sourceBranch: document.getElementById('source-branch').value,
            targetBranch: document.getElementById('branch-name').value,
            targetPath: document.getElementById('target-path-prefix').value,
            testFilePath: document.getElementById('test-file-path').value,
            packageXmlPath: document.getElementById('package-xml-path').value,
            packageXml: document.getElementById('package-xml-content').value,
            manualTestClasses: document.getElementById('manual-test-classes').value,
            commitMessage: document.getElementById('commit-message').value,
            typeMappings: typeMappings
        };
        return new Promise(resolve => chrome.storage.local.set(config, resolve));
    };

    // Save Config
    document.getElementById('btn-save').addEventListener('click', () => {
        saveConfigToStorage().then(() => {
            updateStatus('Configuration saved!', 'success');
        });
    });

    // Open Config in New Tab
    document.getElementById('btn-config-paths').addEventListener('click', () => {
        chrome.tabs.create({ url: chrome.runtime.getURL('popup/mappings.html') });
    });

    // Select Backup Folder
    document.getElementById('btn-select-backup-folder').addEventListener('click', async () => {
        try {
            if (!window.showDirectoryPicker) {
                updateStatus('File System Access API not supported in this browser', 'error');
                return;
            }

            const handle = await window.showDirectoryPicker({
                mode: 'readwrite',
                startIn: 'downloads'
            });

            backupFolderHandle = handle;
            await saveBackupFolderHandle(handle);
            await updateBackupFolderUI();
            updateStatus(`Backup folder selected: ${handle.name}`, 'success');
        } catch (e) {
            if (e.name === 'AbortError') {
                updateStatus('Folder selection cancelled', 'info');
            } else {
                updateStatus('Error selecting folder: ' + e.message, 'error');
                console.error(e);
            }
        }
    });

    // Clear Backup Folder
    document.getElementById('btn-clear-backup-folder').addEventListener('click', async () => {
        try {
            backupFolderHandle = null;
            await clearBackupFolderHandle();
            await updateBackupFolderUI();
            updateStatus('Backup folder cleared. Using Downloads folder.', 'info');
        } catch (e) {
            updateStatus('Error clearing folder: ' + e.message, 'error');
            console.error(e);
        }
    });

    // Update Helper
    document.getElementById('btn-update-helper').addEventListener('click', () => {
        const instructions = document.getElementById('update-instructions');
        instructions.style.display = instructions.style.display === 'none' ? 'block' : 'none';
    });

    document.getElementById('btn-open-github').addEventListener('click', () => {
        chrome.tabs.create({ url: 'https://github.com/purnappc9/salesforce-ado-connector' });
    });

    // Package.xml Templates
    const packageTemplates = {
        'all-apex': `<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
    <types>
        <members>*</members>
        <name>ApexClass</name>
    </types>
    <types>
        <members>*</members>
        <name>ApexTrigger</name>
    </types>
    <version>60.0</version>
</Package>`,

        'custom-objects': `<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
    <types>
        <members>*</members>
        <name>CustomObject</name>
    </types>
    <types>
        <members>*</members>
        <name>CustomField</name>
    </types>
    <types>
        <members>*</members>
        <name>ValidationRule</name>
    </types>
    <version>60.0</version>
</Package>`,

        'lwc-aura': `<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
    <types>
        <members>*</members>
        <name>LightningComponentBundle</name>
    </types>
    <types>
        <members>*</members>
        <name>AuraDefinitionBundle</name>
    </types>
    <version>60.0</version>
</Package>`,

        'full-metadata': `<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
    <types>
        <members>*</members>
        <name>ApexClass</name>
    </types>
    <types>
        <members>*</members>
        <name>ApexTrigger</name>
    </types>
    <types>
        <members>*</members>
        <name>CustomObject</name>
    </types>
    <types>
        <members>*</members>
        <name>LightningComponentBundle</name>
    </types>
    <types>
        <members>*</members>
        <name>AuraDefinitionBundle</name>
    </types>
    <types>
        <members>*</members>
        <name>Flow</name>
    </types>
    <types>
        <members>*</members>
        <name>PermissionSet</name>
    </types>
    <types>
        <members>*</members>
        <name>Profile</name>
    </types>
    <version>60.0</version>
</Package>`,

        'profiles-permissions': `<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
    <types>
        <members>*</members>
        <name>Profile</name>
    </types>
    <types>
        <members>*</members>
        <name>PermissionSet</name>
    </types>
    <types>
        <members>*</members>
        <name>PermissionSetGroup</name>
    </types>
    <version>60.0</version>
</Package>`
    };

    document.getElementById('btn-load-template').addEventListener('click', () => {
        const selector = document.getElementById('package-template-selector');
        const templateKey = selector.value;

        if (!templateKey) {
            updateStatus('Please select a template first', 'error');
            return;
        }

        const content = packageTemplates[templateKey];
        document.getElementById('package-xml-content').value = content;
        updateStatus(`Loaded template: ${selector.options[selector.selectedIndex].text}`, 'success');
    });

    // List Branches Logic
    document.getElementById('btn-list-branches').addEventListener('click', async () => {
        const config = {
            org: document.getElementById('ado-org').value,
            project: document.getElementById('ado-project').value,
            repo: document.getElementById('ado-repo').value,
            pat: document.getElementById('ado-pat').value
        };
        if (!config.org || !config.project || !config.repo || !config.pat) {
            updateStatus('Please fill all ADO fields (Org, Project, Repo, PAT) first.', 'error');
            return;
        }

        updateStatus('Fetching branches...');
        try {
            const branches = await ADO.getBranches(config);
            updateStatus(`Found ${branches.length} branches: ${branches.join(', ')}`, 'success');
        } catch (e) {
            updateStatus('Failed to list branches: ' + e.message, 'error');
        }
    });

    // Autofill Logic
    document.getElementById('btn-autofill').addEventListener('click', () => {
        const url = document.getElementById('ado-url-input').value.trim();
        if (!url) return;

        try {
            // Support formats:
            // 1. https://dev.azure.com/{org}/{project}/_git/{repo}
            // 2. https://{org}.visualstudio.com/{project}/_git/{repo}

            let org, project, repo;

            if (url.includes('dev.azure.com')) {
                const parts = url.split('dev.azure.com/')[1].split('/');
                org = parts[0];
                project = parts[1];
                // finding repo: usually after _git
                const gitIndex = parts.indexOf('_git');
                if (gitIndex > -1 && parts[gitIndex + 1]) {
                    repo = parts[gitIndex + 1];
                } else {
                    repo = project;
                }
            } else if (url.includes('.visualstudio.com')) {
                const parts = url.split('https://')[1].split('/');
                org = parts[0].split('.visualstudio.com')[0];
                project = parts[1];
                const gitIndex = parts.indexOf('_git');
                if (gitIndex > -1 && parts[gitIndex + 1]) {
                    repo = parts[gitIndex + 1];
                } else {
                    repo = project;
                }
            } else {
                throw new Error("Unknown URL format");
            }

            if (org) document.getElementById('ado-org').value = org;
            if (project) document.getElementById('ado-project').value = project;
            if (repo) document.getElementById('ado-repo').value = repo;

            updateStatus('Autofilled ADO details!', 'success');

        } catch (e) {
            updateStatus('Could not parse URL. Please fill manually.', 'error');
        }
    });

    // Open ADO Repo Logic
    document.getElementById('btn-open-ado').addEventListener('click', () => {
        const org = document.getElementById('ado-org').value.trim();
        const project = document.getElementById('ado-project').value.trim();
        const repo = document.getElementById('ado-repo').value.trim();

        if (!org || !project || !repo) {
            updateStatus('Please configure Org, Project, and Repo first.', 'error');
            return;
        }

        let url = `https://dev.azure.com/${org}/${project}/_git/${repo}`;

        // If the org input itself contains '.visualstudio.com' (from manual entry)
        if (org.includes('.visualstudio.com')) {
            url = `https://${org}/${project}/_git/${repo}`;
        }

        chrome.tabs.create({ url: url });
    });

    // Full Page Logic
    const urlParams = new URLSearchParams(window.location.search);
    const isFullPage = urlParams.get('fullpage') === 'true';

    if (isFullPage) {
        document.getElementById('btn-full-page').style.display = 'none';
        chrome.storage.local.get(['sfContext'], (result) => {
            if (result.sfContext) {
                updateStatus(`Loaded Salesforce Context: ${result.sfContext.serverUrl}`, 'success');
            } else {
                updateStatus('Warning: No Salesforce context found.', 'warning');
            }
        });
    }

    document.getElementById('btn-full-page').addEventListener('click', async () => {
        try {
            const { serverUrl, sessionId } = await Salesforce.getSession();
            await chrome.storage.local.set({ sfContext: { serverUrl, sessionId } });
            chrome.tabs.create({ url: chrome.runtime.getURL('popup/popup.html?fullpage=true') });
        } catch (e) {
            updateStatus('Could not capture Salesforce session: ' + e, 'error');
            // Try open anyway
            chrome.tabs.create({ url: chrome.runtime.getURL('popup/popup.html?fullpage=true') });
        }
    });

    // Reconnect Salesforce Logic (Smart Switcher)
    const btnReconnect = document.getElementById('btn-reconnect-sf');
    if (btnReconnect) {
        btnReconnect.addEventListener('click', async () => {
            updateStatus('Scanning for Salesforce Orgs...');
            const picker = document.getElementById('org-picker');
            const orgList = document.getElementById('org-list');
            picker.style.display = 'none'; // reset

            try {
                await chrome.storage.local.remove('sfContext');

                // 1. Check Active Tab First (Priority)
                const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
                let activeOrgDomain = null;
                if (activeTab && activeTab.url && (activeTab.url.includes('salesforce.com') || activeTab.url.includes('force.com'))) {
                    const url = new URL(activeTab.url);
                    activeOrgDomain = url.hostname;
                }

                // 2. Find ALL open Salesforce tabs
                const sfTabs = await chrome.tabs.query({ url: ["*://*.salesforce.com/*", "*://*.force.com/*"] });

                // Deduplicate by Org (roughly by hostname)
                const uniqueDomains = new Set();
                const validTabs = [];
                sfTabs.forEach(t => {
                    try {
                        const host = new URL(t.url).hostname;
                        if (!uniqueDomains.has(host)) {
                            uniqueDomains.add(host);
                            validTabs.push({ id: t.id, url: t.url, title: t.title, domain: host });
                        }
                    } catch (e) { }
                });

                // LOGIC FLOW:
                // A. If Active Tab is SF, use it immediately (User Intent is clear).
                if (activeOrgDomain) {
                    await connectToOrg(activeOrgDomain);
                    return;
                }

                // B. If No SF tabs open
                if (validTabs.length === 0) {
                    throw new Error("No open Salesforce tabs found. Please open your Org in a new tab.");
                }

                // C. If Only 1 SF tab open (and we are in Full Page mode), use it.
                if (validTabs.length === 1) {
                    await connectToOrg(validTabs[0].domain);
                    return;
                }

                // D. Multiple Orgs found -> Show Picker
                updateStatus(`Found ${validTabs.length} active Orgs. Please select one below.`);
                orgList.innerHTML = '';

                validTabs.forEach(tab => {
                    const btn = document.createElement('button');
                    btn.textContent = `Connect to: ${tab.domain}`;
                    btn.title = tab.title;
                    btn.style.textAlign = 'left';
                    btn.style.padding = '8px';
                    btn.style.cursor = 'pointer';

                    btn.onclick = async () => {
                        picker.style.display = 'none';
                        await connectToOrg(tab.domain);
                    };
                    orgList.appendChild(btn);
                });

                picker.style.display = 'block';

            } catch (e) {
                updateStatus('Reconnect failed: ' + e.message, 'error');
                console.error(e);
            }
        });
    }

    document.getElementById('btn-cancel-picker').addEventListener('click', () => {
        document.getElementById('org-picker').style.display = 'none';
        updateStatus('Org selection cancelled.', 'info');
    });

    // Helper to perform the connection
    async function connectToOrg(domain) {
        updateStatus(`Connecting to ${domain}...`);
        try {
            const session = await Salesforce.getSession(domain);
            await chrome.storage.local.set({ sfContext: session });
            updateStatus(`Connected to: ${session.serverUrl}`, 'success');
        } catch (e) {
            updateStatus(`Failed to connect to ${domain}: ${e}`, 'error');
        }
    }

    // Sync Logic
    document.getElementById('btn-sync').addEventListener('click', async () => {
        // Auto-save before sync
        saveConfigToStorage();

        const gitUser = document.getElementById('git-user').value;
        const gitEmail = document.getElementById('git-email').value;

        const config = {
            org: document.getElementById('ado-org').value,
            project: document.getElementById('ado-project').value,
            repo: document.getElementById('ado-repo').value,
            pat: document.getElementById('ado-pat').value,
            sourceBranch: document.getElementById('source-branch').value || 'main',
            branch: document.getElementById('branch-name').value,
            targetPath: document.getElementById('target-path-prefix').value,
            testFile: document.getElementById('test-file-path').value,
            author: (gitUser && gitEmail) ? { name: gitUser, email: gitEmail, date: new Date().toISOString() } : null
        };
        const packageXml = document.getElementById('package-xml-content').value;

        if (!config.org || !config.project || !config.repo || !config.pat || !config.branch) {
            updateStatus('Please fill all ADO configuration fields.', 'error');
            return;
        }
        if (!packageXml.trim()) {
            updateStatus('Please provide package.xml content.', 'error');
            return;
        }

        try {
            updateStatus('Step 1: Connecting to Salesforce...');
            let serverUrl, sessionId;

            // Check for stored session from Reconnect (works in both popup and full page mode)
            const stored = await chrome.storage.local.get(['sfContext']);

            if (stored.sfContext) {
                // Use stored session from reconnect
                serverUrl = stored.sfContext.serverUrl;
                sessionId = stored.sfContext.sessionId;
                console.log('Using stored session from reconnect:', serverUrl);
            } else if (isFullPage) {
                // Full page mode with no stored session - shouldn't happen, but fallback
                const session = await Salesforce.getSession();
                serverUrl = session.serverUrl;
                sessionId = session.sessionId;
            } else {
                // Popup mode with no stored session - get from active tab
                const session = await Salesforce.getSession();
                serverUrl = session.serverUrl;
                sessionId = session.sessionId;
            }

            updateStatus('Connected to Salesforce.');
            updateStatus('Step 2: Retrieving Metadata...');
            const asyncId = await Salesforce.retrieve(serverUrl, sessionId, packageXml);
            updateStatus(`Retrieve started (ID: ${asyncId}). Wait...`);

            // Poll for status
            let completed = false;
            let zipBase64 = null;
            while (!completed) {
                await new Promise(r => setTimeout(r, 2000));
                const status = await Salesforce.checkStatus(serverUrl, sessionId, asyncId);
                if (status.done) {
                    completed = true;
                    if (status.state !== 'Completed') throw new Error(`Retrieve failed: ${status.state}`);
                } else {
                    updateStatus(`Retrieve in progress...`);
                }
            }

            updateStatus('Step 3: Downloading Zip & Backup...');
            zipBase64 = await Salesforce.retrieveZip(serverUrl, sessionId, asyncId);

            // Auto-download or save to folder
            const filename = `salesforce_backup_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.zip`;

            try {
                if (backupFolderHandle) {
                    // Save to selected folder
                    try {
                        // Verify permission
                        const permission = await backupFolderHandle.queryPermission({ mode: 'readwrite' });
                        if (permission !== 'granted') {
                            const newPermission = await backupFolderHandle.requestPermission({ mode: 'readwrite' });
                            if (newPermission !== 'granted') {
                                throw new Error('Permission denied');
                            }
                        }

                        // Extract instance name from serverUrl (e.g., "https://mydomain.my.salesforce.com" -> "mydomain")
                        let instanceName = 'unknown-instance';
                        try {
                            const urlObj = new URL(serverUrl);
                            const hostname = urlObj.hostname; // e.g., "mydomain.my.salesforce.com"
                            instanceName = hostname.split('.')[0]; // "mydomain"
                        } catch (urlError) {
                            console.error('Error parsing instance name:', urlError);
                        }

                        // Create or get instance subfolder
                        let instanceFolderHandle;
                        try {
                            instanceFolderHandle = await backupFolderHandle.getDirectoryHandle(instanceName, { create: true });
                            console.log(`Using instance folder: ${instanceName}`);
                        } catch (folderError) {
                            console.error('Could not create instance folder, using root:', folderError);
                            instanceFolderHandle = backupFolderHandle; // Fallback to root
                        }

                        // Create file and write data
                        const fileHandle = await instanceFolderHandle.getFileHandle(filename, { create: true });
                        const writable = await fileHandle.createWritable();

                        // Convert base64 to blob
                        const binaryString = atob(zipBase64);
                        const bytes = new Uint8Array(binaryString.length);
                        for (let i = 0; i < binaryString.length; i++) {
                            bytes[i] = binaryString.charCodeAt(i);
                        }
                        const blob = new Blob([bytes], { type: 'application/zip' });

                        await writable.write(blob);
                        await writable.close();

                        updateStatus(`Backup saved to: ${backupFolderHandle.name}/${instanceName}/${filename}`, 'success');
                    } catch (folderError) {
                        console.error('Error saving to folder:', folderError);
                        updateStatus('Failed to save to folder, using download instead...', 'warning');

                        // Fallback to download
                        const link = document.createElement("a");
                        link.href = "data:application/zip;base64," + zipBase64;
                        link.download = filename;
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                        updateStatus('Backup downloaded to Downloads folder.', 'success');
                    }
                } else {
                    // No folder selected, use download
                    const link = document.createElement("a");
                    link.href = "data:application/zip;base64," + zipBase64;
                    link.download = filename;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    updateStatus('Backup downloaded. Unzipping...');
                }
            } catch (e) {
                console.error("Backup save/download failed", e);
                updateStatus('Backup save failed: ' + e.message, 'error');
            }

            const files = await Utils.unzipContent(zipBase64);
            updateStatus(`Extracted ${files.length} files.`);

            // Identify Test Classes
            const retrievedTestClasses = [];
            files.forEach(f => {
                if (f.path.endsWith('.cls')) {
                    if (f.contentString.includes('@isTest') || f.contentString.includes('testMethod')) {
                        const basename = f.path.split('/').pop().replace('.cls', '');
                        retrievedTestClasses.push(basename);
                    }
                }
            });

            updateStatus('Step 4: Checking ADO Branch...');

            // Branch Logic
            let branchRef = await ADO.getBranch(config, config.branch);
            let referenceBranchForCheck = config.branch;

            if (!branchRef) {
                updateStatus(`Target branch '${config.branch}' not found.`);
                updateStatus(`Creating from '${config.sourceBranch}'...`);
                branchRef = await ADO.createBranch(config, config.branch, config.sourceBranch);
                referenceBranchForCheck = config.sourceBranch;
            } else {
                updateStatus(`Target branch '${config.branch}' exists.`);
            }

            updateStatus(`Target Commit: ${(branchRef.objectId || 'unknown').substring(0, 7)}`);
            updateStatus(`Checking existing files (Reference: ${referenceBranchForCheck})...`);

            let existingPaths = new Map();
            try {
                existingPaths = await ADO.getExistingFilePaths(config, referenceBranchForCheck);
                updateStatus(`Found ${existingPaths.size} existing files in ${referenceBranchForCheck}.`);
            } catch (e) {
                console.warn("Could not list files", e);
                updateStatus('Warning: Could not list existing files. Defaults to ADD.', 'error');
            }

            updateStatus('Preparing changes...');

            const changes = [];
            const FOLDER_TO_TYPE = {};
            for (const [t, f] of Object.entries(Utils.TYPE_TO_FOLDER)) {
                FOLDER_TO_TYPE[f] = t;
            }

            for (const file of files) {
                let cleanPath = file.path;
                if (cleanPath.startsWith('unpackaged/')) cleanPath = cleanPath.replace('unpackaged/', '');

                // IGNORE ZIP's PACKAGE.XML
                // This prevents it from being processed in the loop and placed incorrectly.
                if (cleanPath === 'package.xml' || cleanPath.endsWith('/package.xml')) {
                    continue;
                }

                const parts = cleanPath.split('/');
                let typeName = null;
                if (parts.length > 1) {
                    const topFolder = parts[0];
                    typeName = FOLDER_TO_TYPE[topFolder];
                }

                let relativeContentPath = cleanPath;
                let fileName = parts[parts.length - 1];

                if (typeName || (parts.length > 0 && parts[0] !== fileName)) {
                    relativeContentPath = parts.slice(1).join('/');
                }

                let configuredPath = null;
                if (typeName && typeMappings[typeName]) {
                    configuredPath = typeMappings[typeName];
                } else if (parts.length > 0) {
                    let prefix = document.getElementById('target-path-prefix').value || '';
                    // Remove leading/trailing slashes
                    prefix = prefix.replace(/^\/+|\/+$/g, '');

                    configuredPath = prefix ? `${prefix}/${parts[0]}` : parts[0];
                }

                // Ensure no double slashes in combined path
                // REUSE THE VARIABLE, DO NOT REDECLARE
                relativeContentPath = (typeName || (parts.length > 0 && parts[0] !== fileName)) ? parts.slice(1).join('/') : cleanPath;
                let combinedPath = configuredPath ? `${configuredPath}/${relativeContentPath}` : relativeContentPath;

                // Final clean to be safe
                combinedPath = combinedPath.replace(/\/+/g, '/');

                const normalizedPath = combinedPath.startsWith('/') ? combinedPath : '/' + combinedPath;
                const pathLower = normalizedPath.toLowerCase();
                const exists = existingPaths.has(pathLower);
                // Fix map usage? It was Map<lowercase, originalCase>
                const validPath = exists ? existingPaths.get(pathLower) : normalizedPath;

                changes.push({
                    changeType: exists ? 'edit' : 'add',
                    item: { path: validPath },
                    newContent: { content: file.contentBase64, contentType: 'base64Encoded' }
                });
            }

            // 1.5 Handle package.xml update
            // Use user-defined path from UI, default to manifest/package.xml
            const userPackagePath = document.getElementById('package-xml-path').value || 'manifest/package.xml';
            const packageXmlPath = userPackagePath.trim();
            const packageXmlLower = (packageXmlPath.startsWith('/') ? packageXmlPath : '/' + packageXmlPath).toLowerCase();
            const pkgExists = existingPaths.has(packageXmlLower);
            const validPkgPath = pkgExists ? existingPaths.get(packageXmlLower) : (packageXmlPath.startsWith('/') ? packageXmlPath : '/' + packageXmlPath);

            changes.push({
                changeType: pkgExists ? 'edit' : 'add',
                item: { path: validPkgPath },
                newContent: { content: btoa(packageXml), contentType: 'base64Encoded' }
            });

            // 2. Handle Test Class List File
            if (config.testFile && config.testFile.trim().length > 0) {
                const manualInput = document.getElementById('manual-test-classes').value;
                if (manualInput) {
                    const manualClasses = manualInput.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
                    manualClasses.forEach(c => retrievedTestClasses.push(c));
                }

                if (retrievedTestClasses.length > 0) {
                    // Normalize user input path
                    const rawTestFile = config.testFile.startsWith('/') ? config.testFile : '/' + config.testFile;
                    const rawTestFileLower = rawTestFile.toLowerCase();

                    let exists = existingPaths.has(rawTestFileLower);
                    let actualPath = exists ? existingPaths.get(rawTestFileLower) : rawTestFile;

                    // Logic Change: OVERWRITE & JOIN WITH COMMA
                    const uniqueClasses = [...new Set(retrievedTestClasses)].sort();
                    const newContent = uniqueClasses.join(',');

                    changes.push({
                        changeType: exists ? 'edit' : 'add',
                        item: { path: actualPath },
                        newContent: { content: btoa(newContent), contentType: 'base64Encoded' }
                    });
                }
            } else {
                updateStatus('Skipping Test Class List update (no path provided).');
            }

            if (changes.length === 0) {
                updateStatus('No changes to commit.', 'success');
                return;
            }

            // PUSH WITH RETRY Logic for TF401028
            const MAX_RETRIES = 2;
            let retryCount = 0;
            let pushSuccess = false;
            const commitMsg = document.getElementById('commit-message').value || "Salesforce Synced Changes";

            while (!pushSuccess && retryCount <= MAX_RETRIES) {
                try {
                    // Update Ref immediately before push attempt
                    const currentBranchRef = await ADO.getBranch(config, config.branch);
                    if (!currentBranchRef) throw new Error("Target branch disappeared.");

                    updateStatus(`Pushing changes (Attempt ${retryCount + 1})...`);
                    await ADO.pushCommit(config, config.branch, currentBranchRef.objectId, changes, commitMsg);
                    pushSuccess = true;
                    updateStatus('Sync Complete!', 'success');

                } catch (pushError) {
                    if (pushError.message.includes('TF401028') || pushError.message.includes('GitReferenceStaleException')) {
                        retryCount++;
                        if (retryCount <= MAX_RETRIES) {
                            updateStatus(`Stale reference detected. Retrying (${retryCount}/${MAX_RETRIES})...`, 'warning');
                            await new Promise(r => setTimeout(r, 1000)); // Wait 1s
                        } else {
                            throw pushError; // Give up
                        }
                    } else {
                        throw pushError; // Other error
                    }
                }
            }

        } catch (err) {
            console.error(err);
            updateStatus('Error: ' + err.message, 'error');
        }
    });

});
