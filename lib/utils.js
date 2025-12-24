// Utility functions
const Utils = {
    // Standard Metadata Folder Mapping
    TYPE_TO_FOLDER: {
        'ApexClass': 'classes',
        'ApexTrigger': 'triggers',
        'ApexComponent': 'components',
        'ApexPage': 'pages',
        'AuraDefinitionBundle': 'aura',
        'LightningComponentBundle': 'lwc',
        'StaticResource': 'staticresources',
        'CustomObject': 'objects',
        'CustomTab': 'tabs',
        'PermissionSet': 'permissionsets',
        'Profile': 'profiles',
        'Layout': 'layouts',
        'Workflow': 'workflows',
        'FlexiPage': 'flexipages',
        'Flow': 'flows'
        // Add more as needed, fallback is lowercase
    },

    // Parse package.xml to extract types and members
    parsePackageXml: (xmlContent) => {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlContent, "text/xml");
        const types = [];

        const typeNodes = xmlDoc.getElementsByTagName("types");
        for (let i = 0; i < typeNodes.length; i++) {
            const nameNode = typeNodes[i].getElementsByTagName("name")[0];
            const name = nameNode ? nameNode.textContent : "";

            const memberNodes = typeNodes[i].getElementsByTagName("members");
            const members = [];
            for (let j = 0; j < memberNodes.length; j++) {
                members.push(memberNodes[j].textContent);
            }

            if (name && members.length > 0) {
                types.push({ name, members });
            }
        }

        const versionNode = xmlDoc.getElementsByTagName("version")[0];
        const version = versionNode ? versionNode.textContent : "58.0";

        return { types, version };
    },

    // Helper to unzip content
    unzipContent: async (base64Content) => {
        const zip = new JSZip();
        // Salesforce returns base64, JSZip handles it
        const loadedZip = await zip.loadAsync(base64Content, { base64: true });

        const files = [];
        loadedZip.forEach((relativePath, zipEntry) => {
            if (!zipEntry.dir) {
                files.push({
                    path: relativePath,
                    stringPromise: zipEntry.async("string"),
                    base64Promise: zipEntry.async("base64")
                });
            }
        });

        // Resolve all content
        for (let file of files) {
            file.contentString = await file.stringPromise;
            file.contentBase64 = await file.base64Promise;
        }

        return files;
    }
};
