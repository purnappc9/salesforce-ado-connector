
document.addEventListener('DOMContentLoaded', async () => {
    const tableBody = document.querySelector('#mapping-table tbody');
    const statusDiv = document.getElementById('status');
    const btnSave = document.getElementById('btn-save');
    const btnAddCustom = document.getElementById('btn-add-custom');
    const customTypeName = document.getElementById('custom-type-name');
    const customTypeFolder = document.getElementById('custom-type-folder');

    // 1. Load config
    const savedConfig = await chrome.storage.local.get(['typeMappings', 'customTypes']);
    let currentMappings = savedConfig.typeMappings || {};
    let customTypes = savedConfig.customTypes || []; // Track user-added types

    // 2. Merge with defaults to ensure all types are shown
    const combinedMappings = { ...Utils.TYPE_TO_FOLDER, ...currentMappings };

    // 3. Render Table
    const renderTable = () => {
        tableBody.innerHTML = '';

        // Sort keys for better readability
        const sortedTypes = Object.keys(combinedMappings).sort();

        sortedTypes.forEach(type => {
            const folder = combinedMappings[type];
            const isCustom = customTypes.includes(type);

            const row = document.createElement('tr');
            if (isCustom) {
                row.className = 'custom-type';
            }

            // Type column
            const typeCell = document.createElement('td');
            typeCell.textContent = type;
            typeCell.style.fontWeight = 'bold';

            // Input column
            const inputCell = document.createElement('td');
            const input = document.createElement('input');
            input.type = 'text';
            input.value = folder;
            input.dataset.type = type;
            inputCell.appendChild(input);

            // Actions column
            const actionsCell = document.createElement('td');
            if (isCustom) {
                const deleteBtn = document.createElement('button');
                deleteBtn.textContent = 'Delete';
                deleteBtn.className = 'delete-btn';
                deleteBtn.onclick = () => deleteCustomType(type);
                actionsCell.appendChild(deleteBtn);
            } else {
                actionsCell.textContent = '-';
                actionsCell.style.textAlign = 'center';
                actionsCell.style.color = '#999';
            }

            row.appendChild(typeCell);
            row.appendChild(inputCell);
            row.appendChild(actionsCell);
            tableBody.appendChild(row);
        });
    };

    renderTable();

    // 4. Add Custom Type
    btnAddCustom.addEventListener('click', () => {
        const typeName = customTypeName.value.trim();
        const folderPath = customTypeFolder.value.trim();

        if (!typeName || !folderPath) {
            statusDiv.textContent = 'Please enter both type name and folder path';
            statusDiv.className = 'error';
            statusDiv.style.color = 'red';
            setTimeout(() => {
                statusDiv.textContent = '';
                statusDiv.className = '';
            }, 3000);
            return;
        }

        // Check if type already exists
        if (combinedMappings[typeName]) {
            statusDiv.textContent = `Type "${typeName}" already exists!`;
            statusDiv.className = 'error';
            statusDiv.style.color = 'orange';
            setTimeout(() => {
                statusDiv.textContent = '';
                statusDiv.className = '';
            }, 3000);
            return;
        }

        // Add to mappings and custom types list
        combinedMappings[typeName] = folderPath;
        customTypes.push(typeName);

        // Clear inputs
        customTypeName.value = '';
        customTypeFolder.value = '';

        // Re-render table
        renderTable();

        statusDiv.textContent = `Added "${typeName}" → "${folderPath}"`;
        statusDiv.className = 'success';
        setTimeout(() => {
            statusDiv.textContent = '';
            statusDiv.className = '';
        }, 3000);
    });

    // 5. Delete Custom Type
    function deleteCustomType(typeName) {
        if (confirm(`Delete custom type "${typeName}"?`)) {
            delete combinedMappings[typeName];
            customTypes = customTypes.filter(t => t !== typeName);
            renderTable();

            statusDiv.textContent = `Deleted "${typeName}"`;
            statusDiv.className = 'success';
            setTimeout(() => {
                statusDiv.textContent = '';
                statusDiv.className = '';
            }, 3000);
        }
    }

    // 6. Save Logic
    btnSave.addEventListener('click', async () => {
        const inputs = tableBody.querySelectorAll('input');
        const newMappings = {};

        inputs.forEach(input => {
            const type = input.dataset.type;
            const folder = input.value.trim();
            if (folder) {
                newMappings[type] = folder;
            }
        });

        await chrome.storage.local.set({
            typeMappings: newMappings,
            customTypes: customTypes
        });

        statusDiv.textContent = 'Mappings Saved Successfully!';
        statusDiv.className = 'success';

        setTimeout(() => {
            statusDiv.textContent = '';
            statusDiv.className = '';
        }, 3000);
    });
});
