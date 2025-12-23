
document.addEventListener('DOMContentLoaded', async () => {
    const tableBody = document.querySelector('#mapping-table tbody');
    const statusDiv = document.getElementById('status');
    const btnSave = document.getElementById('btn-save');

    // 1. Load config
    const savedConfig = await chrome.storage.local.get(['typeMappings']);
    let currentMappings = savedConfig.typeMappings || {};

    // 2. Merge with defaults to ensure all types are shown
    // Utils.TYPE_TO_FOLDER has the implementation defaults
    const combinedMappings = { ...Utils.TYPE_TO_FOLDER, ...currentMappings };

    // 3. Render Table
    const renderTable = () => {
        tableBody.innerHTML = '';

        // Sort keys for better readability
        const sortedTypes = Object.keys(combinedMappings).sort();

        sortedTypes.forEach(type => {
            const folder = combinedMappings[type];

            const row = document.createElement('tr');

            const typeCell = document.createElement('td');
            typeCell.textContent = type;
            typeCell.style.fontWeight = 'bold';

            const inputCell = document.createElement('td');
            const input = document.createElement('input');
            input.type = 'text';
            input.value = folder;
            input.dataset.type = type; // Store type in data attribute
            inputCell.appendChild(input);

            row.appendChild(typeCell);
            row.appendChild(inputCell);
            tableBody.appendChild(row);
        });
    };

    renderTable();

    // 4. Save Logic
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

        await chrome.storage.local.set({ typeMappings: newMappings });

        statusDiv.textContent = 'Mappings Saved Successfully!';
        statusDiv.className = 'success';

        setTimeout(() => {
            statusDiv.textContent = '';
            statusDiv.className = '';
        }, 3000);
    });
});
