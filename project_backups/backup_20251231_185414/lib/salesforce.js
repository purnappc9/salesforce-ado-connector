// Salesforce API Interactions
const Salesforce = {
    DEBUG: false, // Set to true for debug logs
    apiVersion: '60.0', // Updated to match package.xml templates

    // Get Session ID and Server URL from cookies
    getSession: async (targetDomain = null) => {
        return new Promise((resolve, reject) => {
            const query = { name: "sid" };

            chrome.cookies.getAll(query, (cookies) => {
                if (Salesforce.DEBUG) console.log("DEBUG: All 'sid' cookies found:", cookies.map(c => c.domain));

                if (!cookies || cookies.length === 0) {
                    reject("No Salesforce session found. Please login to Salesforce.");
                    return;
                }

                let sfCookie;
                if (targetDomain) {
                    if (Salesforce.DEBUG) console.log(`DEBUG: Target Domain: ${targetDomain}`);
                    // Smart Matching for Lightning vs Classic vs MyDomain
                    // targetDomain might be "my-org.lightning.force.com"
                    // cookie domain might be "my-org.my.salesforce.com"

                    // 1. Try exact/subset match first
                    sfCookie = cookies.find(c => targetDomain.includes(c.domain) || c.domain.includes(targetDomain));

                    // 2. If failed, try matching the "Org Name" (subdomain)
                    if (!sfCookie) {
                        const targetParts = targetDomain.split('.');
                        // The Org ID is usually the first part of the hostname in modern URLs
                        const orgId = targetParts[0];
                        if (Salesforce.DEBUG) console.log(`DEBUG: Extracted Org ID: ${orgId}`);

                        if (orgId && orgId.length > 2) { // Avoid trivial matches like 'www'
                            sfCookie = cookies.find(c => c.domain.includes(orgId) && c.domain.includes('salesforce.com'));
                        }
                    }
                } else {
                    // No target domain? Pick the first ".salesforce.com" one (Legacy behavior)
                    // Or better, prefer "my.salesforce.com" over generic ones if possible?
                    sfCookie = cookies.find(c => c.domain.includes("my.salesforce.com")) || cookies.find(c => c.domain.includes("salesforce.com"));
                }

                if (sfCookie && Salesforce.DEBUG) console.log(`DEBUG: Matched Cookie Domain: ${sfCookie.domain}`);

                if (!sfCookie) {
                    reject("No valid Salesforce session cookie found." + (targetDomain ? ` (Target: ${targetDomain})` : ""));
                    return;
                }

                const serverUrl = `https://${sfCookie.domain}`;
                const sessionId = sfCookie.value;
                resolve({ serverUrl, sessionId });
            });
        });
    },

    // Construct Metadata Retrieve Request SOAP Envelope
    createRetrieveRequest: (packageXmlContent) => {
        // We need to parse the package.xml to construct the <types> list for the SOAP call
        // OR we can just pass the package.xml as a 'unpackaged' block?
        // Actually, the standard retrieve call expects a specific structure.
        // For simplicity in a 'retrieve-by-package.xml' scenario, the easiest way is to use the 'unpackaged' payload 
        // IF we are building it manually, but we have the raw XML.
        // It's cleaner to just parse it and rebuild logic, but sending raw package.xml content inside a retrieve call is tricky 
        // without parsing it into the SOAP structure.
        // Let's assume the Utils.parsePackageXml gives us what we need.

        const packageInfo = Utils.parsePackageXml(packageXmlContent);

        let typesXml = '';
        packageInfo.types.forEach(type => {
            typesXml += `<types>`;
            type.members.forEach(member => {
                typesXml += `<members>${member}</members>`;
            });
            typesXml += `<name>${type.name}</name>`;
            typesXml += `</types>`;
        });

        return `
        <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:met="http://soap.sforce.com/2006/04/metadata">
           <soapenv:Header>
              <met:SessionHeader>
                 <met:sessionId>__SESSION_ID__</met:sessionId>
              </met:SessionHeader>
           </soapenv:Header>
           <soapenv:Body>
              <met:retrieve>
                 <met:retrieveRequest>
                    <met:apiVersion>${packageInfo.version}</met:apiVersion>
                    <met:singlePackage>true</met:singlePackage>
                    <met:unpackaged>
                       ${typesXml}
                       <met:version>${packageInfo.version}</met:version>
                    </met:unpackaged>
                 </met:retrieveRequest>
              </met:retrieve>
           </soapenv:Body>
        </soapenv:Envelope>`;
    },

    retrieve: async (serverUrl, sessionId, packageXmlContent) => {
        const soapBody = Salesforce.createRetrieveRequest(packageXmlContent).replace('__SESSION_ID__', sessionId);
        const url = `${serverUrl}/services/Soap/m/${Salesforce.apiVersion}`;

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'text/xml',
                'SOAPAction': 'retrieve'
            },
            body: soapBody
        });

        if (!response.ok) {
            throw new Error(`Salesforce Retrieve Failed: ${response.statusText}`);
        }

        const text = await response.text();
        // Parse ID from response
        const parser = new DOMParser();
        const doc = parser.parseFromString(text, "text/xml");
        const idNode = doc.getElementsByTagName("id")[0] || doc.getElementsByTagName("result")[0]?.getElementsByTagName("id")[0]; // handle namespaces?

        if (!idNode) {
            // Try getting faultstring
            const fault = doc.getElementsByTagName("faultstring")[0];
            throw new Error(fault ? fault.textContent : "Unknown retrieve error (no ID returned)");
        }

        return idNode.textContent;
    },

    checkStatus: async (serverUrl, sessionId, asyncProcessId) => {
        const soapBody = `
        <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:met="http://soap.sforce.com/2006/04/metadata">
           <soapenv:Header>
              <met:SessionHeader>
                 <met:sessionId>${sessionId}</met:sessionId>
              </met:SessionHeader>
           </soapenv:Header>
           <soapenv:Body>
              <met:checkStatus>
                 <met:asyncProcessId>${asyncProcessId}</met:asyncProcessId>
              </met:checkStatus>
           </soapenv:Body>
        </soapenv:Envelope>`;

        const url = `${serverUrl}/services/Soap/m/${Salesforce.apiVersion}`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'text/xml', 'SOAPAction': 'checkStatus' },
            body: soapBody
        });

        const text = await response.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(text, "text/xml");
        const doneNode = doc.getElementsByTagName("done")[0];
        const stateNode = doc.getElementsByTagName("state")[0];

        return {
            done: doneNode && doneNode.textContent === 'true',
            state: stateNode ? stateNode.textContent : 'Unknown'
        };
    },

    retrieveZip: async (serverUrl, sessionId, asyncProcessId) => {
        const soapBody = `
        <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:met="http://soap.sforce.com/2006/04/metadata">
           <soapenv:Header>
              <met:SessionHeader>
                 <met:sessionId>${sessionId}</met:sessionId>
              </met:SessionHeader>
           </soapenv:Header>
           <soapenv:Body>
              <met:checkRetrieveStatus>
                 <met:asyncProcessId>${asyncProcessId}</met:asyncProcessId>
                 <met:includeZip>true</met:includeZip>
              </met:checkRetrieveStatus>
           </soapenv:Body>
        </soapenv:Envelope>`;

        const url = `${serverUrl}/services/Soap/m/${Salesforce.apiVersion}`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'text/xml', 'SOAPAction': 'checkRetrieveStatus' },
            body: soapBody
        });

        const text = await response.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(text, "text/xml");
        const zipFileNode = doc.getElementsByTagName("zipFile")[0];

        if (!zipFileNode) {
            throw new Error("No zipFile found in retrieve response.");
        }

        return zipFileNode.textContent; // Base64 string
    },

    // Get Current User Info (Name, Email)
    fetchUserInfo: async (serverUrl, sessionId) => {
        const url = `${serverUrl}/services/data/v${Salesforce.apiVersion}/chatter/users/me`;
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${sessionId}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            console.warn("Failed to fetch user info:", response.statusText);
            return null;
        }

        const data = await response.json();
        return {
            name: data.name, // Full Name
            email: data.email // Email Address
        };
    }
};
