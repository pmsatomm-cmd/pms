const STORAGE_COLLEGES = 'collegesDataV2';
const STORAGE_EMPLOYEES = 'employeesData';
const STORAGE_SAVE_AUDIT = 'saveAudit';
const SERVER_BASE = '';

let colleges = {};
let employees = [];
let currentRole = null;
let currentEmployeeId = null;
let currentEmployeeName = null;
let currentCollegeId = null;
let currentProgramId = null;
let currentEditingEmployeeId = null;
let activeViewLayout = 'grid';
let dashboardSearchQuery = '';

function getSessionRole() {
    return sessionStorage.getItem('tms_role');
}

function getSessionEmployeeId() {
    return sessionStorage.getItem('tms_employeeId');
}

function setSessionRole(role, employeeId = null) {
    sessionStorage.setItem('tms_role', role);
    if (employeeId) {
        sessionStorage.setItem('tms_employeeId', employeeId);
    } else {
        sessionStorage.removeItem('tms_employeeId');
    }
}

function setSessionCollegeProgram(collegeId, programId = null) {
    if (collegeId) sessionStorage.setItem('tms_collegeId', collegeId);
    if (programId) sessionStorage.setItem('tms_programId', programId);
}

function getSessionCollegeId() {
    return sessionStorage.getItem('tms_collegeId');
}

function getSessionProgramId() {
    return sessionStorage.getItem('tms_programId');
}

function clearSession() {
    sessionStorage.removeItem('tms_role');
    sessionStorage.removeItem('tms_employeeId');
    sessionStorage.removeItem('tms_collegeId');
    sessionStorage.removeItem('tms_programId');
}

function getQueryParam(name) {
    const search = window.location.search;
    const params = new URLSearchParams(search);
    return params.get(name);
}

function mergeServerState(state) {
    if (!state) return;
    if (state.colleges && Object.keys(state.colleges).length > 0) {
        colleges = { ...state.colleges, ...colleges };
    }
    if (Array.isArray(state.employees) && state.employees.length > 0) {
        const byId = {};
        employees.forEach(emp => {
            if (emp && emp.id) byId[emp.id] = emp;
        });
        state.employees.forEach(emp => {
            if (emp && emp.id) byId[emp.id] = emp;
        });
        employees = Object.values(byId);
    }
}

async function loadServerState() {
    if (!window.fetch) return;
    try {
        const res = await fetch(`${SERVER_BASE}/api/state`);
        if (!res.ok) return;
        const json = await res.json();
        if (json && json.data) {
            mergeServerState(json.data);
            localStorage.setItem(STORAGE_COLLEGES, JSON.stringify(colleges));
            localStorage.setItem(STORAGE_EMPLOYEES, JSON.stringify(employees));
        }
    } catch (err) {
        console.warn('Server state load failed', err);
    }
}

function saveStateToServer() {
    if (!window.fetch) return;
    const payload = { state: { colleges, employees } };
    fetch(`${SERVER_BASE}/api/save-state`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    })
        .then(res => {
            if (!res.ok) return res.text().then(text => { throw new Error(text || 'Save state failed'); });
            return res.json();
        })
        .then(() => {
            console.log('Server state saved');
        })
        .catch(err => {
            console.warn('Server save failed', err);
        });
}

function seedAdminAccounts() {
    // Remove ALL old @atomadmin accounts (all case variations)
    employees = employees.filter(emp => {
        const lowerEmpId = emp.id.toLowerCase();
        return !lowerEmpId.includes('@atomadmin');
    });

    const adminSeeds = [
        {
            id: 'tech',
            name: 'TeCh Admin',
            designation: 'Super Admin',
            department: 'Admin',
            active: true,
            password: 'TUF@gaming#A15'
        },
        {
            id: 'abishith@atom.com',
            name: 'Abishith Rao (Author | Founder & CEO )',
            designation: 'Author | Founder & CEO',
            department: 'Atom',
            active: true,
            password: 'abishith@atom.com'
        },
        {
            id: 'lilly@atom.com',
            name: 'Lilly John (Team HR)',
            designation: 'Team HR',
            department: 'Atom',
            active: true,
            password: 'lilly@atom.com'
        },
        {
            id: 'saikumar@atom.com',
            name: 'Sai Kumar (Team L&D)',
            designation: 'Team L&D',
            department: 'Atom',
            active: true,
            password: 'saikumar@atom.com'
        }
    ];

    let modified = false;
    adminSeeds.forEach(seed => {
        const existing = employees.find(emp => emp.id.toUpperCase() === seed.id.toUpperCase());
        if (!existing) {
            employees.push(seed);
            modified = true;
        }
    });

    // Always save after cleanup to ensure @atomadmin accounts are removed
    localStorage.setItem(STORAGE_EMPLOYEES, JSON.stringify(employees));

    if (modified) {
        localStorage.setItem(STORAGE_EMPLOYEES, JSON.stringify(employees));
    }
}

function loadEmployees() {
    try {
        const saved = localStorage.getItem(STORAGE_EMPLOYEES);
        employees = saved ? JSON.parse(saved) : [];
    } catch (err) {
        employees = [];
    }

    // Find and delete @atomadmin accounts from database
    const atomadminAccounts = employees.filter(emp => emp.id.toLowerCase().includes('@atomadmin'));
    atomadminAccounts.forEach(emp => {
        fetch('/api/delete-employee', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: emp.id })
        }).catch(err => console.error('Failed to delete:', emp.id, err));
    });

    // Remove all @atomadmin accounts from localStorage
    employees = employees.filter(emp => !emp.id.toLowerCase().includes('@atomadmin'));
    localStorage.setItem(STORAGE_EMPLOYEES, JSON.stringify(employees));
    seedAdminAccounts();

    // Sync clean state back to server
    if (atomadminAccounts.length > 0) {
        saveStateToServer();
    }
}

function isAdminUserId(id) {
    if (!id || typeof id !== 'string') return false;
    const lower = id.toLowerCase();
    return lower === 'admin'
        || lower === 'tech'
        || lower.endsWith('@atom.com')
        || lower.includes('@atomadmin');
}

function getAdminIdFromKey(key) {
    if (!key || typeof key !== 'string') return null;
    const lowerKey = key.toLowerCase();
    const emp = employees.find(item => {
        const id = (item.id || '').toLowerCase();
        return id === lowerKey || id.startsWith(lowerKey + '@');
    });
    if (emp) return emp.id;
    return `${key}@atomadmin`;
}

function saveEmployees() {
    localStorage.setItem(STORAGE_EMPLOYEES, JSON.stringify(employees));
    updateEmployeeDropdowns();
    saveStateToServer();
}

async function loadData() {
    try {
        const saved = localStorage.getItem(STORAGE_COLLEGES);
        colleges = saved ? JSON.parse(saved) : {};
    } catch (err) {
        colleges = {};
    }
    loadEmployees();
    await loadServerState();
}

function saveData() {
    localStorage.setItem(STORAGE_COLLEGES, JSON.stringify(colleges));
    saveStateToServer();
}

function getEmployeeOptions() {
    return employees
        .filter(emp => !isAdminUserId(emp.id))
        .map(emp => `<option value="${emp.id}">${emp.name} (${emp.id})</option>`).join('');
}

function getEmployeeCheckboxMarkup(selectedIds = [], disabled = false, subsectionId = '') {
    const list = employees.filter(emp => !isAdminUserId(emp.id));
    if (list.length === 0) {
        return '<div class="empty-employee-list">No employees available.</div>';
    }
    
    const selectedEmployees = list.filter(emp => selectedIds.includes(emp.id));
    const tagsHtml = selectedEmployees.map(emp => `
        <span class="emp-tag">
            ${emp.name}
            ${!disabled ? `<span class="emp-tag-remove" onclick="event.stopPropagation(); removeEmployeeFromSelection('${emp.id}', '${subsectionId}')">&times;</span>` : ''}
        </span>
    `).join('');
    
    const placeholderStyle = selectedEmployees.length > 0 ? 'display: none;' : 'display: block;';
    const disabledClass = disabled ? 'disabled' : '';
    
    const optionsHtml = list.map(emp => {
        const checked = selectedIds.includes(emp.id) ? 'checked' : '';
        const isDisabled = disabled ? 'disabled' : '';
        const labelText = `${emp.name} (${emp.id})`;
        return `
            <div class="emp-option-item" onclick="handleOptionItemClick(this, event)">
                <input type="checkbox" data-employee-checkbox="${emp.id}" value="${emp.id}" ${checked} ${isDisabled} onclick="event.stopPropagation();" onchange="handleEmployeeCheckboxChange(this, '${subsectionId}')" />
                <span class="option-label">${labelText}</span>
            </div>
        `;
    }).join('');

    return `
        <div class="employee-multiselect-container ${disabledClass}" id="empMultiselect-${subsectionId}">
            <div class="employee-selected-trigger" onclick="toggleEmployeeDropdown('${subsectionId}', event)">
                <span class="employee-placeholder" id="empPlaceholder-${subsectionId}" style="${placeholderStyle}">Select Employees...</span>
                <div class="employee-selected-tags" id="empTags-${subsectionId}">
                    ${tagsHtml}
                </div>
                <span class="dropdown-arrow"><i class="fas fa-chevron-down"></i></span>
            </div>
            <div class="employee-dropdown-options" id="empDropdown-${subsectionId}">
                ${optionsHtml}
            </div>
        </div>
    `;
}

function toggleEmployeeDropdown(subsectionId, event) {
    if (event) event.stopPropagation();
    
    // Close other employee dropdowns
    document.querySelectorAll('.employee-dropdown-options').forEach(dropdown => {
        if (dropdown.id !== `empDropdown-${subsectionId}`) {
            dropdown.style.display = 'none';
        }
    });
    
    const dropdown = document.getElementById(`empDropdown-${subsectionId}`);
    if (dropdown) {
        // Don't open if disabled
        const container = dropdown.closest('.employee-multiselect-container');
        if (container && container.classList.contains('disabled')) return;
        
        const isHidden = dropdown.style.display === 'none' || !dropdown.style.display;
        dropdown.style.display = isHidden ? 'block' : 'none';
    }
}

function handleOptionItemClick(itemDiv, event) {
    const cb = itemDiv.querySelector('input[type=checkbox]');
    if (cb && !cb.disabled) {
        cb.checked = !cb.checked;
        cb.dispatchEvent(new Event('change'));
    }
}

function removeEmployeeFromSelection(empId, subsectionId) {
    const multiselect = document.getElementById(`empMultiselect-${subsectionId}`);
    if (!multiselect) return;
    const cb = multiselect.querySelector(`input[data-employee-checkbox="${empId}"]`);
    if (cb && !cb.disabled) {
        cb.checked = false;
        cb.dispatchEvent(new Event('change'));
    }
}

function renderEmployeeCheckboxGroup(wrapper, selectedIds = [], disabled = false) {
    if (!wrapper) return;
    const subId = wrapper.dataset.employee || '';
    wrapper.innerHTML = getEmployeeCheckboxMarkup(selectedIds, disabled, subId);
}

function handleEmployeeCheckboxChange(input, subsectionId) {
    if (currentRole === 'admin' || isProgramArchived()) {
        input.checked = !input.checked;
        return;
    }
    
    const container = input.closest('.employee-multiselect-container');
    if (container && subsectionId) {
        const checkedBoxes = container.querySelectorAll('input[type=checkbox][data-employee-checkbox]:checked');
        const selectedIds = Array.from(checkedBoxes).map(cb => cb.value);
        
        // Enforce validation: if checklist items are Done, must have at least 1 person checked
        const checklist = document.querySelector(`#trainingForm .checklist[data-subsection="${subsectionId}"]`);
        const hasDoneItems = checklist ? Array.from(checklist.querySelectorAll('.toggle-switch[data-item]')).some(cb => cb.checked) : false;
        
        if (hasDoneItems && selectedIds.length === 0) {
            alert(`At least one employee must be selected in "Completed By" while items in this section are marked as Done.`);
            input.checked = true; // Re-check
            return;
        }
        
        const tagsDiv = container.querySelector('.employee-selected-tags');
        const placeholderSpan = container.querySelector('.employee-placeholder');
        const list = employees.filter(emp => !isAdminUserId(emp.id));
        const selectedEmployees = list.filter(emp => selectedIds.includes(emp.id));
        
        if (placeholderSpan) {
            placeholderSpan.style.display = selectedEmployees.length > 0 ? 'none' : 'block';
        }
        if (tagsDiv) {
            tagsDiv.innerHTML = selectedEmployees.map(emp => `
                <span class="emp-tag">
                    ${emp.name}
                    <span class="emp-tag-remove" onclick="event.stopPropagation(); removeEmployeeFromSelection('${emp.id}', '${subsectionId}')">&times;</span>
                </span>
            `).join('');
        }
    }
    
    setTimeout(saveCurrentProgram, 300);
}

function updateEmployeeDropdowns() {
    const options = '<option value="">-- Select Employee --</option>' + getEmployeeOptions();
    document.querySelectorAll('[data-employee]').forEach(el => {
        if (!el) return;
        if (el.tagName.toLowerCase() === 'select') {
            const currentVal = el.value;
            el.innerHTML = options;
            if (currentVal) el.value = currentVal;
        } else if (el.classList.contains('employee-checkboxes')) {
            const isDisabled = currentRole === 'admin';
            let selectedIds = [];
            const existingChecked = el.querySelectorAll('input[type=checkbox][data-employee-checkbox]:checked');
            if (existingChecked.length > 0) {
                selectedIds = Array.from(existingChecked).map(cb => cb.value);
            } else if (currentCollegeId && currentProgramId) {
                const program = colleges[currentCollegeId]?.programs?.[currentProgramId];
                if (program) {
                    const data = getSavedProgramData(program);
                    const key = 'employee_' + el.dataset.employee;
                    const value = data[key] || '';
                    selectedIds = value ? value.split(',').map(item => item.trim()).filter(Boolean) : [];
                }
            }
            renderEmployeeCheckboxGroup(el, selectedIds, isDisabled);
        }
    });

    const loginSelect = document.getElementById('employeeSelect');
    if (loginSelect && loginSelect.tagName.toLowerCase() === 'select') {
        const previousValue = loginSelect.value;
        loginSelect.innerHTML = '<option value="">-- Select Employee --</option>' + getEmployeeOptions();
        if (previousValue) loginSelect.value = previousValue;
    }

    renderEmployeeList();
}

let employeeModalMode = 'employee';

async function directResetAdminPassword(empId) {
    const emp = employees.find(item => item.id === empId);
    if (!emp) return;
    const newPassword = prompt(`Enter new password for admin ${emp.name}:`);
    if (newPassword === null) return;
    const trimmed = newPassword.trim();
    if (!trimmed) {
        alert('Password cannot be empty.');
        return;
    }
    emp.password = await hashPassword(trimmed);
    saveEmployees();
    showEmployeeFeedback(`Password for ${emp.name} updated successfully.`, 'success');
}
window.directResetAdminPassword = directResetAdminPassword;

function renderEmployeeList() {
    const container = document.getElementById('employeeListItems');
    if (!container) return;

    const list = employees.filter(emp => {
        const lowerId = emp.id.toLowerCase();
        // Filter out @atomadmin accounts and Super Admin accounts (admin, tech)
        if (lowerId.includes('@atomadmin') || lowerId === 'tech' || lowerId === 'admin') {
            return false;
        }
        const isAdminId = isAdminUserId(emp.id);
        return employeeModalMode === 'admin' ? isAdminId : !isAdminId;
    });

    if (list.length === 0) {
        container.innerHTML = `<div style="color:#6b85a0; padding:12px;">No ${employeeModalMode === 'admin' ? 'admins' : 'employees'} added yet.</div>`;
        return;
    }

    container.innerHTML = list.map(emp => {
        const isEmpActive = (emp.active !== false);
        const statusHtml = isEmpActive
            ? `<span style="color: #059669; font-size: 11px; font-weight: 700; background: #d1fae5; padding: 2px 8px; border-radius: 12px; width: fit-content; margin-top: 2px;">Active</span>`
            : `<span style="color: #d97706; font-size: 11px; font-weight: 700; background: #fef3c7; padding: 2px 8px; border-radius: 12px; width: fit-content; margin-top: 2px;">Pending: <b>${emp.activationCode || ''}</b></span>`;

        let actionsHtml = '';
        if (employeeModalMode === 'admin') {
            actionsHtml = `<button class="btn btn-sm" onclick="directResetAdminPassword('${emp.id}')" style="padding: 4px 12px; font-size: 12px; height: 30px; display: inline-flex; align-items: center; gap: 4px; background: #008037; color: white; border: none; border-radius: 6px;"><i class="fas fa-key"></i> Reset Password</button>`;
        } else {
            const resetBtnHtml = isEmpActive
                ? `<button class="btn btn-sm" onclick="generateResetCodeForEmployee('${emp.id}')" style="padding: 4px 8px; font-size: 11px; height: 30px; display: inline-flex; align-items: center; gap: 4px; background: #008037; color: white; border: none; border-radius: 6px;"><i class="fas fa-key"></i> Reset Code</button>
                  <button class="btn btn-sm" id="copy-btn-${emp.id}" onclick="copyResetCode('${emp.id}')" style="padding: 4px 8px; font-size: 11px; height: 30px; display: none; align-items: center; gap: 4px; background: #008037; color: white; border: none; border-radius: 6px;"><i class="fas fa-copy"></i> Copy Code</button>`
                : '';
            actionsHtml = `
                ${resetBtnHtml}
                <button class="btn btn-sm btn-info" onclick="editEmployee('${emp.id}')" style="padding: 4px 12px; font-size: 12px; height: 30px; display: inline-flex; align-items: center; gap: 4px;"><i class="fas fa-edit"></i> Edit</button>
                <button class="btn btn-sm btn-danger" onclick="removeEmployee('${emp.id}')" style="padding: 4px 12px; font-size: 12px; height: 30px; display: inline-flex; align-items: center; gap: 4px;"><i class="fas fa-trash-alt"></i> Delete</button>
            `;
        }

        return `
            <div class="employee-row" style="display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; margin-bottom: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.02);">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <i class="fas fa-user-circle" style="color: #008037; font-size: 20px;"></i>
                    <div style="display: flex; flex-direction: column; gap: 2px;">
                        <strong style="color: #0f172a; font-size: 14px;">${emp.name}</strong>
                        <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                            <span style="color: #64748b; font-size: 11px; font-weight: 600; background: #e2e8f0; padding: 1px 6px; border-radius: 6px; width: fit-content;">ID: ${emp.id}</span>
                            ${statusHtml}
                        </div>
                    </div>
                </div>
                <div class="employee-actions" style="display: flex; gap: 6px; align-items: center;">
                    ${actionsHtml}
                </div>
            </div>
        `;
    }).join('');
}

function openEmployeeModal() {
    if (currentRole !== 'admin') {
        alert('Only Admin can manage employees.');
        return;
    }
    employeeModalMode = 'employee';
    updateModalModeUI();
    const modal = document.getElementById('employeeModal');
    if (!modal) return;
    modal.classList.add('active');
    clearEmployeeFields();
    renderEmployeeList();
}

function openAdminModal() {
    const isSuperAdmin = (currentRole === 'admin' && sessionStorage.getItem('tms_admin_key') === 'all');
    if (!isSuperAdmin) {
        alert('Only Super Admin can manage sub-admins.');
        return;
    }
    employeeModalMode = 'admin';
    updateModalModeUI();
    const modal = document.getElementById('employeeModal');
    if (!modal) return;
    modal.classList.add('active');
    clearEmployeeFields();
    renderEmployeeList();
}

function updateModalModeUI() {
    const modal = document.getElementById('employeeModal');
    if (!modal) return;
    const title = modal.querySelector('h2');
    const subtitle = modal.querySelector('p');
    const listHeader = modal.querySelector('#employeeListDisplay h4');
    const formContainer = document.getElementById('employeeFormContainer');

    if (employeeModalMode === 'admin') {
        if (title) title.innerHTML = '<i class="fas fa-user-shield" style="color:#008037;"></i> Manage Admins';
        if (subtitle) subtitle.textContent = 'Reset credentials for sub-administrators.';
        if (listHeader) listHeader.textContent = 'Admin List';
        if (formContainer) formContainer.style.display = 'none';
    } else {
        if (title) title.innerHTML = '<i class="fas fa-users" style="color:#008037;"></i> Manage Employees';
        if (subtitle) subtitle.textContent = 'Add or edit employee records for program completion tracking.';
        if (listHeader) listHeader.textContent = 'Employee List';
        if (formContainer) formContainer.style.display = 'block';
    }
}

function closeEmployeeModal() {
    const modal = document.getElementById('employeeModal');
    if (modal) modal.classList.remove('active');
}

function clearEmployeeFields() {
    currentEditingEmployeeId = null;
    const empName = document.getElementById('empName');
    const empId = document.getElementById('empId');
    const empPassword = document.getElementById('empPassword');
    const feedback = document.getElementById('employeeFeedback');
    if (empName) empName.value = '';
    if (empId) {
        empId.value = '';
        empId.disabled = false;
    }
    if (empPassword) empPassword.value = '';
    if (feedback) {
        feedback.textContent = '';
        feedback.style.display = 'none';
    }
    const button = document.getElementById('btnAddEmployee');
    if (button) {
        button.innerHTML = employeeModalMode === 'admin'
            ? '<i class="fas fa-plus"></i> Add Admin'
            : '<i class="fas fa-plus"></i> Add Employee';
    }
}

function showEmployeeFeedback(message, type = 'success') {
    const feedback = document.getElementById('employeeFeedback');
    if (!feedback) return;
    feedback.textContent = message;
    feedback.className = 'employee-feedback' + (type === 'error' ? ' error' : '');
    feedback.style.display = 'block';
}

function editEmployee(empId) {
    const emp = employees.find(item => item.id === empId);
    if (!emp) return;
    currentEditingEmployeeId = empId;
    document.getElementById('empName').value = emp.name;
    document.getElementById('empId').value = emp.id;
    // Keep Employee ID editable so it can be manually entered if needed

    // Clear password field to protect hash and wait for new set-password if they want to reset it
    const empPassword = document.getElementById('empPassword');
    if (empPassword) empPassword.value = '';

    const passwordLabel = document.getElementById('empPasswordLabel');
    if (passwordLabel) {
        // Change Set Password to Reset/Change Password when editing
        passwordLabel.innerHTML = 'Reset Password (leave blank to keep current)';
    }

    const button = document.getElementById('btnAddEmployee');
    if (button) button.innerHTML = '<i class="fas fa-save"></i> Save Changes';
}

function generateActivationCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 4; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    code += '-';
    for (let i = 0; i < 4; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

async function hashPassword(password) {
    const msgUint8 = new TextEncoder().encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
}

function generateResetCodeForEmployee(empId) {
    const emp = employees.find(item => item.id === empId);
    if (!emp) return;

    const resetCode = generateActivationCode();
    emp.resetCode = resetCode;
    emp.resetCodeExpiry = Date.now() + 24 * 60 * 60 * 1000;

    saveEmployees();
    renderEmployeeList();

    // Auto-copy reset code to clipboard
    setTimeout(() => {
        copyToClipboard(resetCode);
        showEmployeeFeedback(`Reset Code generated for ${emp.name}: ${resetCode} (Copied to clipboard!)`, 'success');
        
        // Show copy button
        const copyBtn = document.getElementById(`copy-btn-${empId}`);
        const resetBtn = document.querySelector(`button[onclick="generateResetCodeForEmployee('${empId}')"]`);
        if (copyBtn && resetBtn) {
            copyBtn.style.display = 'inline-flex';
            resetBtn.style.display = 'none';
        }
    }, 100);
}

function copyResetCode(empId) {
    const emp = employees.find(item => item.id === empId);
    if (!emp || !emp.resetCode) {
        alert('Reset code not found. Please generate a new one.');
        return;
    }
    
    copyToClipboard(emp.resetCode);
    showEmployeeFeedback(`Reset Code copied to clipboard: ${emp.resetCode}`, 'success');
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).catch(err => {
        console.error('Failed to copy to clipboard:', err);
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
    });
}

async function addEmployee() {
    if (currentRole !== 'admin') {
        alert('Only Admin can add employees.');
        return;
    }
    const name = document.getElementById('empName').value.trim();
    let id = document.getElementById('empId').value.trim();
    const password = document.getElementById('empPassword') ? document.getElementById('empPassword').value : '';
    const designation = document.getElementById('empDesignation') ? document.getElementById('empDesignation').value.trim() : '';
    const department = document.getElementById('empDepartment') ? document.getElementById('empDepartment').value.trim() : '';

    if (!name || !id) {
        alert('Please enter a name and ID/Username.');
        return;
    }

    if (employeeModalMode === 'admin') {
        if (!id.includes('@')) {
            id = id + '@atomadmin';
        }
    }

    if (currentEditingEmployeeId) {
        const employee = employees.find(item => item.id === currentEditingEmployeeId);
        if (employee) {
            employee.name = name;
            employee.designation = designation;
            employee.department = department;
            if (employeeModalMode === 'admin' && password) {
                employee.password = await hashPassword(password);
            }
            showEmployeeFeedback(`${employeeModalMode === 'admin' ? 'Admin' : 'Employee'} updated successfully.`);
        }
    } else {
        if (employees.some(item => item.id.toUpperCase() === id.toUpperCase())) {
            alert('An account with this ID/Username already exists.');
            return;
        }

        const activationCode = generateActivationCode();
        const expiry = Date.now() + 24 * 60 * 60 * 1000;

        const isActive = (employeeModalMode === 'admin');
        let hash = '';
        if (isActive) {
            hash = password ? await hashPassword(password) : await hashPassword(id);
        }

        employees.push({
            id,
            name,
            designation,
            department,
            active: isActive,
            activationCode: isActive ? '' : activationCode,
            activationCodeExpiry: isActive ? 0 : expiry,
            password: hash
        });

        if (isActive) {
            showEmployeeFeedback(`Admin added successfully.`);
        } else {
            showEmployeeFeedback(`Employee added successfully. Activation Code: ${activationCode}`);
        }
    }
    saveEmployees();
    updateEmployeeDropdowns();
    renderEmployeeList();
    clearEmployeeFields();
}

function removeEmployee(empId) {
    if (!confirm('Delete ' + (employeeModalMode === 'admin' ? 'admin ' : 'employee ') + empId + '?')) return;
    employees = employees.filter(emp => emp.id !== empId);
    saveEmployees();
    // Delete from database
    fetch('/api/delete-employee', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: empId })
    }).catch(err => console.error('Error deleting employee from database:', err));
    renderEmployeeList();
}

async function initLoginPage() {
    await loadData();
}

// Visiblity Screen Toggles
function showNormalLogin() {
    document.getElementById('normalLoginContainer').style.display = 'block';
    document.getElementById('firstTimeLoginFields').style.display = 'none';
    document.getElementById('createPasswordFields').style.display = 'none';
    document.getElementById('forgotPasswordFields').style.display = 'none';
    document.getElementById('resetVerificationFields').style.display = 'none';
    document.getElementById('resetCreatePasswordFields').style.display = 'none';
}

function scrollToLoginForm() {
    const loginCard = document.querySelector('.login-card-floating');
    if (loginCard) {
        loginCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

function showFirstTimeLogin() {
    document.getElementById('normalLoginContainer').style.display = 'none';
    document.getElementById('firstTimeLoginFields').style.display = 'block';
    document.getElementById('createPasswordFields').style.display = 'none';
    document.getElementById('forgotPasswordFields').style.display = 'none';
    document.getElementById('resetVerificationFields').style.display = 'none';
    document.getElementById('resetCreatePasswordFields').style.display = 'none';
}

function showForgotPassword() {
    document.getElementById('normalLoginContainer').style.display = 'none';
    document.getElementById('firstTimeLoginFields').style.display = 'none';
    document.getElementById('createPasswordFields').style.display = 'none';
    document.getElementById('forgotPasswordFields').style.display = 'none';
    document.getElementById('resetVerificationFields').style.display = 'block';
    document.getElementById('resetCreatePasswordFields').style.display = 'none';

    // Clear reset input fields
    const rId = document.getElementById('resetEmployeeId');
    const rName = document.getElementById('resetEmployeeName');
    const rCode = document.getElementById('resetCodeInput');
    if (rId) rId.value = '';
    if (rName) rName.value = '';
    if (rCode) rCode.value = '';
}

function showResetCodeVerification() {
    document.getElementById('normalLoginContainer').style.display = 'none';
    document.getElementById('firstTimeLoginFields').style.display = 'none';
    document.getElementById('createPasswordFields').style.display = 'none';
    document.getElementById('forgotPasswordFields').style.display = 'none';
    document.getElementById('resetVerificationFields').style.display = 'block';
    document.getElementById('resetCreatePasswordFields').style.display = 'none';
}

let verifiedEmployeeIdForActivation = null;

function verifyFirstTimeLogin() {
    const empId = document.getElementById('ftEmployeeId').value.trim();
    const empName = document.getElementById('ftEmployeeName').value.trim();
    const code = document.getElementById('ftActivationCode').value.trim();

    if (!empId || !empName || !code) {
        alert('Please enter Employee ID, Name, and Activation Code.');
        return;
    }

    const formattedId = empId.toUpperCase();
    const emp = employees.find(item => item.id.toUpperCase() === formattedId);

    if (!emp) {
        alert('Employee ID does not exist.');
        return;
    }

    if (emp.name.toLowerCase().trim() !== empName.toLowerCase().trim()) {
        alert('Employee Name does not match our records.');
        return;
    }

    if (emp.active === true) {
        alert('This account is already active. Please log in normally.');
        return;
    }

    if (emp.activationCode !== code) {
        alert('Invalid activation code.');
        return;
    }

    if (emp.activationCodeExpiry && emp.activationCodeExpiry < Date.now()) {
        alert('Activation code has expired. Please contact your administrator.');
        return;
    }

    verifiedEmployeeIdForActivation = emp.id;

    // Transition to create password
    document.getElementById('firstTimeLoginFields').style.display = 'none';
    document.getElementById('createPasswordFields').style.display = 'block';
}

async function submitCreatePassword() {
    const pwd = document.getElementById('newPassword').value;
    const conf = document.getElementById('confirmPassword').value;

    if (!pwd || !conf) {
        alert('Please enter and confirm your password.');
        return;
    }

    if (pwd !== conf) {
        alert('Passwords do not match.');
        return;
    }

    if (!verifiedEmployeeIdForActivation) {
        alert('Activation session invalid. Please try again.');
        showFirstTimeLogin();
        return;
    }

    const emp = employees.find(item => item.id === verifiedEmployeeIdForActivation);
    if (!emp) {
        alert('Employee not found.');
        showFirstTimeLogin();
        return;
    }

    const hash = await hashPassword(pwd);
    emp.password = hash;
    emp.active = true;
    delete emp.activationCode;
    delete emp.activationCodeExpiry;

    saveEmployees();

    alert('Account activated successfully! Redirecting to login...');
    showNormalLogin();

    document.getElementById('loginIdentifier').value = emp.id;
    document.getElementById('loginPassword').value = '';
}

function requestResetPassword() {
    const empId = document.getElementById('forgotEmployeeId').value.trim();
    const empName = document.getElementById('forgotEmployeeName').value.trim();

    if (!empId || !empName) {
        alert('Please enter Employee ID and Name.');
        return;
    }

    const formattedId = empId.toUpperCase();
    const emp = employees.find(item => item.id.toUpperCase() === formattedId);

    if (!emp) {
        alert('Employee record not found.');
        return;
    }

    if (emp.name.toLowerCase().trim() !== empName.toLowerCase().trim()) {
        alert('Employee Name does not match our records.');
        return;
    }

    // Display admin message
    document.getElementById('resetRequestMsgBox').style.display = 'block';
    document.getElementById('forgotPassSubmitBtnContainer').style.display = 'none';
    document.getElementById('forgotPassNextBtnContainer').style.display = 'block';
}

let verifiedEmployeeIdForReset = null;

function verifyResetCode() {
    const empId = document.getElementById('resetEmployeeId').value.trim();
    const empName = document.getElementById('resetEmployeeName').value.trim();
    const code = document.getElementById('resetCodeInput').value.trim();

    if (!empId || !empName || !code) {
        alert('Please enter Employee ID, Name, and Reset Code.');
        return;
    }

    const formattedId = empId.toUpperCase();
    const emp = employees.find(item => item.id.toUpperCase() === formattedId);

    if (!emp) {
        alert('Employee ID does not exist.');
        return;
    }

    if (emp.name.toLowerCase().trim() !== empName.toLowerCase().trim()) {
        alert('Employee Name does not match our records.');
        return;
    }

    if (!emp.resetCode || emp.resetCode !== code) {
        alert('Invalid reset code.');
        return;
    }

    if (emp.resetCodeExpiry && emp.resetCodeExpiry < Date.now()) {
        alert('Reset code has expired. Please contact your administrator.');
        return;
    }

    verifiedEmployeeIdForReset = emp.id;

    // Transition to create new password
    document.getElementById('resetVerificationFields').style.display = 'none';
    document.getElementById('resetCreatePasswordFields').style.display = 'block';
}

async function submitResetPassword() {
    const pwd = document.getElementById('resetNewPassword').value;
    const conf = document.getElementById('resetConfirmPassword').value;

    if (!pwd || !conf) {
        alert('Please enter and confirm your password.');
        return;
    }

    if (pwd !== conf) {
        alert('Passwords do not match.');
        return;
    }

    if (!verifiedEmployeeIdForReset) {
        alert('Reset session invalid. Please try again.');
        showNormalLogin();
        return;
    }

    const emp = employees.find(item => item.id === verifiedEmployeeIdForReset);
    if (!emp) {
        alert('Employee not found.');
        showNormalLogin();
        return;
    }

    const hash = await hashPassword(pwd);
    emp.password = hash;
    emp.active = true;
    delete emp.resetCode;
    delete emp.resetCodeExpiry;

    saveEmployees();

    alert('Password updated successfully! Redirecting to login...');
    showNormalLogin();

    document.getElementById('loginIdentifier').value = emp.id;
    document.getElementById('loginPassword').value = '';
}

async function loginPageLogin() {
    const identifier = document.getElementById('loginIdentifier').value.trim();
    const password = document.getElementById('loginPassword').value.trim();

    if (!identifier || !password) {
        alert('Please enter both Username/Employee ID and Password.');
        return;
    }

    // REJECT @Atomadmin accounts - these are old/deprecated
    if (identifier.toLowerCase().includes('@atomadmin')) {
        alert('This account has been deprecated. Please use your @atom.com credentials.');
        return;
    }

    const lowerId = identifier.toLowerCase();
    if (identifier === 'TeCh') {
        const adminUser = employees.find(item => item.id === 'TeCh');
        const expectedPassword = (adminUser && adminUser.password) || 'TUF@gaming#A15';
        const hashedVal = await hashPassword(password);
        if (password !== expectedPassword && hashedVal !== expectedPassword) {
            alert('Incorrect Admin password.');
            return;
        }
        setSessionRole('admin', null);
        sessionStorage.setItem('tms_admin_key', 'all');
        sessionStorage.setItem('tms_admin_name', 'TeCh Admin');
        showLoginToast('Logged in as Admin: TeCh Admin');
        
        // Exclude super admin login from activity logs
        setTimeout(() => {
            window.location.href = 'dashboard.html';
        }, 900);
        return;
    }

    const formattedId = identifier.toUpperCase();
    let emp = employees.find(item => item.id.toUpperCase() === formattedId);
    if (!emp) {
        alert('User ID is not registered. Please contact the administrator.');
        return;
    }

    if (emp.active === false) {
        alert('Your account is pending activation. Please click "First Time Login" to set your password.');
        return;
    }

    const hashedVal = await hashPassword(password);
    const expectedPassword = emp.password || emp.id;
    let valid = false;
    if (password === expectedPassword || hashedVal === expectedPassword) {
        valid = true;
    }

    if (!valid) {
        alert('Incorrect password.');
        return;
    }

    if (isAdminUserId(emp.id)) {
        setSessionRole('admin', null);
        const prefix = emp.id.toLowerCase().split('@')[0];
        sessionStorage.setItem('tms_admin_key', prefix);
        sessionStorage.setItem('tms_admin_name', emp.name);
        showLoginToast(`Logged in as Admin: ${emp.name}`);
        
        // Exclude super admin accounts (admin/tech) from activity logs
        const isSuperAdmin = emp.id.toLowerCase() === 'admin' || emp.id.toLowerCase() === 'tech';
        if (!isSuperAdmin) {
            fetch('/api/log-activity', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: emp.id,
                    userName: emp.name,
                    role: 'admin',
                    eventType: 'login'
                })
            }).catch(err => console.error(err));
        }
        
        setTimeout(() => {
            window.location.href = 'dashboard.html';
        }, 900);
    } else {
        currentEmployeeId = emp.id;
        currentEmployeeName = emp.name;
        setSessionRole('employee', currentEmployeeId);
        showLoginToast(`Logged in as ${currentEmployeeName}`);
        fetch('/api/log-activity', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: emp.id,
                userName: emp.name,
                role: 'employee',
                eventType: 'login'
            })
        }).catch(err => console.error(err));
        setTimeout(() => {
            window.location.href = 'dashboard.html';
        }, 900);
    }
}

function showLoginToast(message) {
    const toast = document.getElementById('loginToast');
    if (!toast) return;
    const toastMsg = document.getElementById('toastMsg');
    if (toastMsg) {
        toastMsg.textContent = message;
    } else {
        toast.textContent = message;
    }
    toast.style.display = 'flex';
    toast.style.opacity = '1';
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => {
            toast.style.display = 'none';
        }, 300);
    }, 1800);
}

async function initDashboardPage() {
    await loadData();
    currentRole = getSessionRole();
    currentEmployeeId = getSessionEmployeeId();
    if (!currentRole) {
        window.location.href = 'index.html';
        return;
    }
    if (currentRole === 'employee' && currentEmployeeId) {
        const emp = employees.find(item => item.id === currentEmployeeId);
        currentEmployeeName = emp ? emp.name : null;
    }
    renderRoleBadge();
    applyDashboardPermissions();
    renderColleges();
    updateEmployeeDropdowns();
    // Ensure dashboard search input is empty by default (prevent browser autofill / restore)
    const searchInput = document.getElementById('searchColleges');
    if (searchInput) {
        searchInput.setAttribute('autocomplete', 'off');
        searchInput.setAttribute('autocorrect', 'off');
        searchInput.setAttribute('autocapitalize', 'off');
        searchInput.setAttribute('spellcheck', 'false');
        searchInput.setAttribute('name', 'search-colleges');
        try {
            searchInput.value = '';
            dashboardSearchQuery = '';
        } catch (e) { }
        // Browser may restore autofill after load, so clear once more after a short delay.
        setTimeout(() => {
            try {
                searchInput.value = '';
                dashboardSearchQuery = '';
                renderColleges();
            } catch (e) { }
        }, 150);
    }
}

function renderRoleBadge() {
    const badge = document.getElementById('roleBadge');
    if (!badge) return;
    if (currentRole === 'admin') {
        badge.innerHTML = '<i class="fas fa-shield-alt"></i> ADMIN';
        badge.className = 'role-badge admin';
    } else {
        badge.innerHTML = `<i class="fas fa-user"></i> ${currentEmployeeName || 'EMPLOYEE'} (${currentEmployeeId})`;
        badge.className = 'role-badge employee';
    }
}

function applyDashboardPermissions() {
    const isAdmin = currentRole === 'admin';
    const isSuperAdmin = (isAdmin && sessionStorage.getItem('tms_admin_key') === 'all');
    const manageButton = document.getElementById('btnManageEmployees');
    if (manageButton) manageButton.style.display = isAdmin ? 'inline-flex' : 'none';
    const addCollegeBtn = document.getElementById('btnAddCollegeHeader');
    const isEmployee = currentRole === 'employee';
    if (addCollegeBtn) addCollegeBtn.style.display = isEmployee ? 'inline-flex' : 'none';
    const manageAdminsBtn = document.getElementById('btnManageAdmins');
    if (manageAdminsBtn) manageAdminsBtn.style.display = isSuperAdmin ? 'inline-flex' : 'none';
    const sheetsButton = document.getElementById('btnGoogleSheets');
    if (sheetsButton) sheetsButton.style.display = isAdmin ? 'inline-flex' : 'none';
}

function updateMetrics() {
    const totalColleges = Object.keys(colleges).length;
    const totalEmployees = employees.filter(emp => !isAdminUserId(emp.id)).length;
    let yetToStartCount = 0;
    let ongoingCount = 0;
    let completedCount = 0;

    for (const collegeId in colleges) {
        const college = colleges[collegeId];
        if (college.programs) {
            for (const programId in college.programs) {
                const program = college.programs[programId];
                const status = getProgramStatus(program);
                if (status.text === 'Completed') {
                    completedCount++;
                } else if (status.text === 'Ongoing') {
                    ongoingCount++;
                } else if (status.text === 'Yet to start') {
                    yetToStartCount++;
                }
            }
        }
    }

    const metricCol = document.getElementById('metricTotalColleges');
    const metricEmp = document.getElementById('metricTotalEmployees');
    const metricYetToStart = document.getElementById('metricYetToStart');
    const metricOngoing = document.getElementById('metricOngoing');
    const metricCompleted = document.getElementById('metricCompleted');

    if (metricCol) metricCol.textContent = totalColleges;
    if (metricEmp) metricEmp.textContent = totalEmployees;
    if (metricYetToStart) metricYetToStart.textContent = yetToStartCount;
    if (metricOngoing) metricOngoing.textContent = ongoingCount;
    if (metricCompleted) metricCompleted.textContent = completedCount;
}

function toggleLayout(mode) {
    activeViewLayout = mode;

    const btnGrid = document.getElementById('btnGridView');
    const btnList = document.getElementById('btnListView');
    const grid = document.getElementById('collegeGrid');

    if (mode === 'grid') {
        if (btnGrid) btnGrid.classList.add('active');
        if (btnList) btnList.classList.remove('active');
        if (grid) {
            grid.classList.remove('list-layout');
            grid.classList.add('grid-layout');
        }
    } else {
        if (btnGrid) btnGrid.classList.remove('active');
        if (btnList) btnList.classList.add('active');
        if (grid) {
            grid.classList.remove('grid-layout');
            grid.classList.add('list-layout');
        }
    }
    renderColleges();
}

function handleSearch() {
    const input = document.getElementById('searchColleges');
    if (input) {
        dashboardSearchQuery = input.value.trim().toLowerCase();
    }
    renderColleges();
}

function getProgramStatus(program) {
    const data = program.formData || {};
    const allSigDone = !!(data['sig-sai'] && data['sig-lilly'] && data['sig-abishith']);

    if (allSigDone) {
        return { text: 'Completed', class: 'complete' };
    }

    let start = null;
    let end = null;
    const trainingDatesStr = data.trainingDates || program.trainingDates || '';
    if (trainingDatesStr) {
        const parts = trainingDatesStr.split(' to ');
        if (parts.length === 2) {
            start = new Date(parts[0]);
            end = new Date(parts[1]);
        }
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (start && !isNaN(start.getTime())) start.setHours(0, 0, 0, 0);
    if (end && !isNaN(end.getTime())) end.setHours(0, 0, 0, 0);

    if (end && !isNaN(end.getTime()) && today > end) {
        return { text: 'Pending', class: 'pending' };
    } else if (start && !isNaN(start.getTime()) && today < start) {
        return { text: 'Yet to start', class: 'yet-to-start' };
    } else if (start && end && !isNaN(start.getTime()) && !isNaN(end.getTime()) && today >= start && today <= end) {
        return { text: 'Ongoing', class: 'ongoing' };
    }

    return { text: 'Yet to start', class: 'yet-to-start' };
}

function renderColleges() {
    const grid = document.getElementById('collegeGrid');
    const emptyState = document.getElementById('emptyState');
    if (!grid) return;

    updateMetrics();

    let keys = Object.keys(colleges);

    if (dashboardSearchQuery) {
        keys = keys.filter(id => {
            const college = colleges[id];
            const nameMatch = (college.name || '').toLowerCase().includes(dashboardSearchQuery);
            const creatorMatch = (college.createdBy || '').toLowerCase().includes(dashboardSearchQuery);
            let programMatch = false;
            if (college.programs) {
                programMatch = Object.values(college.programs).some(p =>
                    (p.name || '').toLowerCase().includes(dashboardSearchQuery)
                );
            }
            return nameMatch || creatorMatch || programMatch;
        });
    }

    if (keys.length === 0) {
        grid.innerHTML = '';
        if (emptyState) {
            emptyState.style.display = 'block';
            if (dashboardSearchQuery) {
                emptyState.querySelector('h3').textContent = 'No Colleges Found';
                emptyState.querySelector('p').textContent = 'No colleges matched your search query.';
            } else {
                emptyState.querySelector('h3').textContent = 'No Colleges Added Yet';
                emptyState.querySelector('p').textContent = 'Add your first college and begin creating programs.';
            }
        }
        return;
    }

    if (emptyState) emptyState.style.display = 'none';

    grid.className = `college-grid ${activeViewLayout}-layout`;

    grid.innerHTML = keys.map(id => {
        const college = colleges[id];
        const programs = Object.values(college.programs || {});
        const programCount = programs.length;
        const firstLetter = (college.name || 'U').charAt(0).toUpperCase();

        const programListMarkup = programs.slice(0, 3).map(program => {
            const status = getProgramStatus(program);

            return `
                <div class="program-row">
                    <span class="program-row-name">${program.name || 'Unnamed Program'}</span>
                    <span class="program-status-pill ${status.class}">${status.text}</span>
                </div>
            `;
        }).join('');

        const moreBadge = programs.length > 3 ?
            `<div style="font-size:12px; color:#64748b; padding:4px 12px; text-align:center;">+ ${programs.length - 3} more programs...</div>` : '';

        const collegeDesc = college.createdBy ? `Created by: ${college.createdBy}` : 'Process Documentation';

        return `
            <div class="college-card">
                <div class="college-card-header">
                    <div class="college-card-brand">
                        <div class="college-logo-letter">${firstLetter}</div>
                        <div class="college-card-titles">
                            <span class="college-card-name">${college.name || 'Unnamed'}</span>
                            <span class="college-card-desc">${collegeDesc}</span>
                        </div>
                    </div>
                    <span class="college-program-count-badge">${programCount} ${programCount === 1 ? 'Program' : 'Programs'}</span>
                </div>
                
                <div class="college-programs-list">
                    ${programListMarkup}
                    ${moreBadge}
                </div>
                
                <div class="college-card-meta">
                    <div class="college-meta-employees">
                        <i class="fas fa-users"></i>
                        <span>${employees.filter(emp => !isAdminUserId(emp.id)).length} Employees</span>
                    </div>
                    <div class="college-meta-creator" style="display:flex; align-items:center; gap:5px; font-size:12px; color:#64748b;">
                        <i class="fas fa-user-plus" style="font-size:11px; color:#7c3aed;"></i>
                        <span style="font-weight:600; color:#334155;">Created by:</span>
                        <span style="color:#1e40af; font-weight:600;">${college.createdBy || 'Admin'}</span>
                    </div>
                </div>
                
                <div class="college-card-footer-buttons">
                    <button class="btn btn-card-open" onclick="event.stopPropagation(); openProgramPage('${id}')">
                        <i class="fas fa-folder-open"></i> Open
                    </button>
                    <button class="btn btn-card-new" onclick="event.stopPropagation(); openProgramPage('${id}', '', true)">
                        <i class="fas fa-plus"></i> New
                    </button>
                    <button class="btn btn-card-delete" onclick="event.stopPropagation(); deleteCollege('${id}')">
                        <i class="fas fa-trash-alt"></i> Delete
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

function openProgramPage(collegeId, programId = '', newProgram = false) {
    if (!collegeId) return;
    setSessionCollegeProgram(collegeId, programId || null);
    const params = new URLSearchParams();
    params.set('college', collegeId);
    if (programId) params.set('program', programId);
    if (newProgram) params.set('new', '1');
    window.location.href = 'program.html?' + params.toString();
}

function openAddCollegeModal() {
    const modal = document.getElementById('addCollegeModal');
    if (!modal) return;
    modal.classList.add('active');
    const name = document.getElementById('newCollegeName');
    if (name) name.focus();
}

function closeAddCollegeModal() {
    const modal = document.getElementById('addCollegeModal');
    if (!modal) return;
    modal.classList.remove('active');
    const name = document.getElementById('newCollegeName');
    if (name) name.value = '';
}

function createCollege() {
    const input = document.getElementById('newCollegeName');
    if (!input) return;
    const name = input.value.trim();
    if (!name) {
        alert('Please enter a college name.');
        return;
    }
    const id = 'college_' + Date.now();

    // Record who created this college
    let createdBy = 'Admin';
    if (currentRole === 'employee' && currentEmployeeName) {
        createdBy = `${currentEmployeeName} (${currentEmployeeId})`;
    }

    colleges[id] = {
        id,
        name,
        createdBy,
        createdAt: new Date().toISOString(),
        programs: {}
    };
    saveData();
    closeAddCollegeModal();
    renderColleges();
    alert(' College created successfully.');
    openProgramPage(id, '', true);
}

function deleteCollege(id) {
    if (!confirm('Delete "' + (colleges[id]?.name || 'this college') + '" and all its programs?')) return;
    delete colleges[id];
    saveData();
    // Delete from database
    fetch('/api/delete-college', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ collegeId: id })
    }).catch(err => console.error('Error deleting college from database:', err));
    renderColleges();
}

function logout() {
    const role = getSessionRole();
    let userId = 'unknown';
    let userName = 'Unknown';
    if (role === 'admin') {
        const key = sessionStorage.getItem('tms_admin_key');
        if (key === 'all') {
            userId = 'admin';
            userName = 'Super Admin';
        } else {
            const emp = employees.find(item => item.id.toLowerCase().startsWith(key + '@'));
            userId = emp ? emp.id : getAdminIdFromKey(key);
            userName = sessionStorage.getItem('tms_admin_name') || 'Admin';
        }
    } else if (role === 'employee') {
        userId = getSessionEmployeeId();
        const emp = employees.find(item => item.id === userId);
        userName = emp ? emp.name : 'Employee';
    }

    if (role) {
        const isSuperAdmin = userId && (userId.toLowerCase() === 'admin' || userId.toLowerCase() === 'tech');
        if (isSuperAdmin) {
            clearSession();
            window.location.href = 'index.html';
            return;
        }

        fetch('/api/log-activity', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: userId,
                userName: userName,
                role: role,
                eventType: 'logout'
            })
        }).finally(() => {
            clearSession();
            window.location.href = 'index.html';
        });
        return;
    } else {
        clearSession();
        window.location.href = 'index.html';
    }
}

async function initProgramPage() {
    await loadData();
    currentRole = getSessionRole();
    currentEmployeeId = getSessionEmployeeId();
    if (!currentRole) {
        window.location.href = 'index.html';
        return;
    }
    if (currentRole === 'employee' && currentEmployeeId) {
        const emp = employees.find(item => item.id === currentEmployeeId);
        currentEmployeeName = emp ? emp.name : null;
    }
    renderRoleBadge();
    updateEmployeeDropdowns();
    applyProgramPermissions();
    currentCollegeId = getQueryParam('college') || getSessionCollegeId();
    currentProgramId = getQueryParam('program') || getSessionProgramId();
    if (!currentCollegeId || !colleges[currentCollegeId]) {
        window.location.href = 'dashboard.html';
        return;
    }
    setSessionCollegeProgram(currentCollegeId, currentProgramId || null);
    renderProgramSelector();
    const newProgram = getQueryParam('new') === '1';
    if (newProgram) {
        openNewProgramModal(currentCollegeId);
    } else {
        if (!currentProgramId) {
            const activeProgram = Object.values(colleges[currentCollegeId].programs || {}).find(p => !p.isArchived);
            currentProgramId = activeProgram ? activeProgram.id : Object.keys(colleges[currentCollegeId].programs || {})[0] || null;
            if (currentProgramId) setSessionCollegeProgram(currentCollegeId, currentProgramId);
        }
        const selector = document.getElementById('programSelector');
        if (selector && currentProgramId) selector.value = currentProgramId;
        switchProgram();
    }
}

function goBackToDashboard() {
    window.location.href = 'dashboard.html';
}

function openGoogleSheetsView() {
    window.location.href = 'sheet.html';
}

function applyProgramPermissions() {
    const isAdmin = currentRole === 'admin';
    const isSuperAdmin = (isAdmin && sessionStorage.getItem('tms_admin_key') === 'all');
    const manageButton = document.getElementById('btnManageEmployees');
    const archiveButton = document.getElementById('btnArchive');
    const archiveFooter = document.getElementById('btnArchiveFooter');
    const signatureArea = document.getElementById('signatureArea');
    if (manageButton) manageButton.style.display = isAdmin ? 'inline-flex' : 'none';
    const manageAdminsBtn = document.getElementById('btnManageAdmins');
    if (manageAdminsBtn) manageAdminsBtn.style.display = isSuperAdmin ? 'inline-flex' : 'none';
    if (archiveButton) archiveButton.style.display = isAdmin ? 'inline-flex' : 'none';
    if (archiveFooter) archiveFooter.style.display = isAdmin ? 'inline-flex' : 'none';
    if (signatureArea) signatureArea.style.display = isAdmin ? 'flex' : 'none';
    const sheetsButton = document.getElementById('btnGoogleSheets');
    if (sheetsButton) sheetsButton.style.display = isAdmin ? 'inline-flex' : 'none';

    // Restrict admin from editing the header-grid fields
    applyHeaderGridLock(isAdmin);
    if (isAdmin) {
        restrictAdminSignatures();
    }
}

function restrictAdminSignatures() {
    if (currentRole !== 'admin') return;

    const adminKey = sessionStorage.getItem('tms_admin_key') || 'all';

    const sigs = {
        'abishith': { txt: 'tform-sig-abishith', dt: 'tform-sig-abishith-date' },
        'lilly': { txt: 'tform-sig-lilly', dt: 'tform-sig-lilly-date' },
        'sai': { txt: 'tform-sig-sai', dt: 'tform-sig-sai-date' }
    };

    for (const key in sigs) {
        const txtEl = document.getElementById(sigs[key].txt);
        const dtEl = document.getElementById(sigs[key].dt);
        if (txtEl && dtEl) {
            if (adminKey === 'all' || adminKey === key) {
                txtEl.style.display = '';
                dtEl.style.display = '';
                txtEl.disabled = false;
                dtEl.disabled = false;
            } else {
                txtEl.style.display = 'none';
                dtEl.style.display = 'none';
            }
        }
    }

    const itemAbishith = document.getElementById('sig-item-abishith');
    const itemLilly = document.getElementById('sig-item-lilly');
    const itemSai = document.getElementById('sig-item-sai');

    if (itemAbishith && itemLilly && itemSai) {
        // Reset grid and flex styles
        [itemAbishith, itemLilly, itemSai].forEach(item => {
            item.style.gridColumn = '';
            item.style.gridRow = '';
            item.style.order = '';
        });

        const area = document.getElementById('signatureArea');
        if (area) {
            area.style.display = 'grid';
            area.style.gridTemplateColumns = '1fr 2fr 1.5fr';
            area.style.gridTemplateRows = 'auto auto';
            area.style.gap = '15px 30px';
            area.style.alignItems = 'center';
        }

        if (adminKey === 'abishith') {
            itemAbishith.style.gridColumn = '2';
            itemAbishith.style.gridRow = '1 / span 2';

            itemLilly.style.gridColumn = '3';
            itemLilly.style.gridRow = '1';

            itemSai.style.gridColumn = '3';
            itemSai.style.gridRow = '2';
        } else if (adminKey === 'lilly') {
            itemLilly.style.gridColumn = '2';
            itemLilly.style.gridRow = '1 / span 2';

            itemAbishith.style.gridColumn = '3';
            itemAbishith.style.gridRow = '1';

            itemSai.style.gridColumn = '3';
            itemSai.style.gridRow = '2';
        } else if (adminKey === 'sai') {
            itemSai.style.gridColumn = '2';
            itemSai.style.gridRow = '1 / span 2';

            itemAbishith.style.gridColumn = '3';
            itemAbishith.style.gridRow = '1';

            itemLilly.style.gridColumn = '3';
            itemLilly.style.gridRow = '2';
        } else {
            if (area) {
                area.style.display = 'flex';
            }
        }
    }
}

function applyHeaderGridLock(lock) {
    const headerFieldIds = [
        'tform-collegeName',
        'tform-semesterBatch',
        'tform-trainingDates',
        'tform-totalHours',
        'tform-trainerTrainee'
    ];
    headerFieldIds.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.disabled = lock;
        el.style.opacity = lock ? '0.7' : '1';
        el.style.cursor = lock ? 'not-allowed' : '';
        el.style.background = lock ? '#f1f5f9' : '';
        el.title = lock ? 'This field can only be edited by employees.' : '';
    });

    // Lock the Training Domain multi-select container
    const domainContainer = document.getElementById('tformDomainMultiSelect');
    if (domainContainer) {
        domainContainer.style.pointerEvents = lock ? 'none' : '';
        domainContainer.style.opacity = lock ? '0.7' : '1';
        domainContainer.style.cursor = lock ? 'not-allowed' : '';
        domainContainer.style.background = lock ? '#f1f5f9' : '';
        domainContainer.title = lock ? 'This field can only be edited by employees.' : '';
    }

}

function renderProgramSelector() {
    const selector = document.getElementById('programSelector');
    const college = colleges[currentCollegeId];
    if (!selector || !college) return;
    selector.innerHTML = '<option value="">-- Select Program --</option>';
    const programs = Object.values(college.programs || {});
    programs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    programs.forEach(program => {
        const option = document.createElement('option');
        option.value = program.id;
        option.textContent = (program.isArchived ? ' ' : ' ') + (program.name || 'Unnamed') + (program.isArchived ? ' (Archived)' : '');
        selector.appendChild(option);
    });
    if (currentProgramId) selector.value = currentProgramId;
}

function openNewProgramModal(collegeId = '') {
    if (collegeId) {
        currentCollegeId = collegeId;
        setSessionCollegeProgram(collegeId, null);
    }
    const modal = document.getElementById('newProgramModal');
    if (!modal) return;
    document.getElementById('newProgramName').value = 'Program ' + new Date().toLocaleDateString();
    document.getElementById('newProgramSemester').value = '';
    document.getElementById('newProgramStartDate').value = '';
    document.getElementById('newProgramEndDate').value = '';
    document.getElementById('newProgramTotalHours').value = '';
    document.getElementById('newProgramTrainerTrainee').value = '';
    setSelectedDomains([]);
    modal.classList.add('active');
}

function closeNewProgramModal() {
    const modal = document.getElementById('newProgramModal');
    if (modal) modal.classList.remove('active');
}

function createNewProgramWithDetails() {
    if (!currentCollegeId || !colleges[currentCollegeId]) {
        alert('Please select a valid college first.');
        return;
    }
    const name = document.getElementById('newProgramName').value.trim();
    const semester = document.getElementById('newProgramSemester').value.trim();
    const domains = getSelectedDomains();
    const startDate = document.getElementById('newProgramStartDate').value;
    const endDate = document.getElementById('newProgramEndDate').value;
    const totalHours = document.getElementById('newProgramTotalHours').value;
    const trainerTrainee = document.getElementById('newProgramTrainerTrainee').value.trim();
    if (!name || !semester || domains.length === 0 || !startDate || !endDate || !totalHours || !trainerTrainee) {
        alert('Please complete all required fields before creating the program.');
        return;
    }
    const college = colleges[currentCollegeId];
    const id = 'prog_' + Date.now();

    const domainString = domains.join(', ');
    const formatDate = dateStr => {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    };
    const initialFormData = {
        collegeName: college.name || '',
        semesterBatch: semester,
        trainingDomain: domainString,
        trainingDomainArray: domains,
        trainingDates: formatDate(startDate) + ' to ' + formatDate(endDate),
        totalHours,
        trainerTrainee,
        rawStartDate: startDate,
        rawEndDate: endDate
    };

    college.programs[id] = {
        id,
        name,
        createdAt: new Date().toISOString(),
        isArchived: false,
        formData: initialFormData
    };

    if (currentRole === 'employee' && currentEmployeeId) {
        college.programs[id].formDataByEmployee = { [currentEmployeeId]: initialFormData };
    }

    saveData();
    closeNewProgramModal();
    setSessionCollegeProgram(currentCollegeId, id);
    window.location.href = 'program.html?college=' + encodeURIComponent(currentCollegeId) + '&program=' + encodeURIComponent(id);
}

function switchProgram() {
    const selector = document.getElementById('programSelector');
    if (!selector) return;
    const programId = selector.value;
    currentProgramId = programId || null;
    setSessionCollegeProgram(currentCollegeId, currentProgramId);
    const formContainer = document.getElementById('formContainer');
    if (!programId) {
        clearForm();
        document.getElementById('formProgramName').textContent = '';
        document.getElementById('programInfo').textContent = 'Status: No program selected';
        if (formContainer) formContainer.classList.remove('active');
        return;
    }
    const college = colleges[currentCollegeId];
    const program = college?.programs?.[programId];
    if (!program) return;
    document.getElementById('formProgramName').textContent = ' - ' + (program.name || 'Unnamed');
    document.getElementById('programInfo').textContent = program.isArchived ? ' Archived - Read Only' : ' Active - In Progress';
    if (formContainer) formContainer.classList.add('active');
    loadProgramData(programId);
}

function getSavedProgramData(program) {
    if (!program) return {};
    if (currentRole === 'employee' && currentEmployeeId) {
        if (!program.formDataByEmployee) program.formDataByEmployee = {};
        return program.formDataByEmployee[currentEmployeeId] || program.formData || {};
    }
    return program.formData || {};
}

function setSavedProgramData(program, data) {
    if (!program) return;
    if (currentRole === 'employee' && currentEmployeeId) {
        if (!program.formDataByEmployee) program.formDataByEmployee = {};
        program.formDataByEmployee[currentEmployeeId] = data;
    } else {
        program.formData = data;
    }
}

function loadProgramData(programId) {
    const college = colleges[currentCollegeId];
    const program = college?.programs?.[programId];
    if (!program) return;

    const data = getSavedProgramData(program);
    const archived = program.isArchived || false;
    document.getElementById('tform-collegeName').value = data.collegeName || college.name || '';
    document.getElementById('tform-semesterBatch').value = data.semesterBatch || '';
    document.getElementById('tform-trainingDates').value = data.trainingDates || '';
    document.getElementById('tform-totalHours').value = data.totalHours || '';
    document.getElementById('tform-trainerTrainee').value = data.trainerTrainee || '';

    const savedDomains = data.trainingDomainArray || (data.trainingDomain ? data.trainingDomain.split(',').map(item => item.trim()) : []);
    document.getElementById('tform-trainingDomain').value = data.trainingDomain || '';
    setSelectedDomains(savedDomains, 'tform');
    const domainDisplay = document.getElementById('tformDomainDropdown') ? document.getElementById('tformSelectedDomainTags') : null;
    if (savedDomains.length > 0 && domainDisplay) {
        document.getElementById('tformSelectedDomainTags').innerHTML = savedDomains.map(domain => `<span class="tag">${domain}<span class="remove-tag" onclick="event.stopPropagation(); removeDomain('${domain}', 'tform')">&times;</span></span>`).join('');
        document.getElementById('tformDomainPlaceholder').style.display = 'none';
    }

    document.querySelectorAll('#trainingForm .toggle-switch[data-item]').forEach(el => {
        const key = el.dataset.item;
        const active = data[key] === true;
        el.checked = active;
        el.classList.toggle('active', active);
        const status = document.getElementById('tform-itemStatus-' + key);
        if (status) {
            status.textContent = active ? 'Done' : 'Not Done';
            status.className = 'toggle-status ' + (active ? 'done' : 'notdone');
        }
    });

    document.querySelectorAll('#trainingForm .sub-checkbox[data-item]').forEach(el => {
        el.checked = data[el.dataset.item] === true;
    });

    document.querySelectorAll('#trainingForm .toggle-switch[data-target]').forEach(el => {
        const key = 'master_' + el.dataset.target;
        const active = data[key] === true;
        el.checked = active;
        el.classList.toggle('active', active);
        const status = document.getElementById('tform-masterStatus-' + el.dataset.target);
        if (status) {
            status.textContent = active ? 'Done' : 'Not Done';
            status.className = 'master-status ' + (active ? 'done' : 'notdone');
        }
    });

    document.querySelectorAll('#trainingForm [data-comment]').forEach(el => {
        const key = 'comment_' + el.dataset.comment;
        el.value = data[key] || '';
    });

    document.querySelectorAll('#trainingForm [data-employee]').forEach(el => {
        const key = 'employee_' + el.dataset.employee;
        const value = data[key] || '';
        if (el.classList.contains('employee-checkboxes')) {
            const selectedIds = value ? value.split(',').map(item => item.trim()).filter(Boolean) : [];
            const disabled = currentRole === 'admin' || archived;
            renderEmployeeCheckboxGroup(el, selectedIds, disabled);
        } else {
            el.value = value;
        }
    });

    if (currentRole === 'admin') {
        document.getElementById('tform-sig-sai').value = data['sig-sai'] || '';
        document.getElementById('tform-sig-sai-date').value = data['sig-sai-date'] || '';
        document.getElementById('tform-sig-lilly').value = data['sig-lilly'] || '';
        document.getElementById('tform-sig-lilly-date').value = data['sig-lilly-date'] || '';
        document.getElementById('tform-sig-abishith').value = data['sig-abishith'] || '';
        document.getElementById('tform-sig-abishith-date').value = data['sig-abishith-date'] || '';
        checkSignatureStatus();
    }

    const saved1A3 = data['scope_1A3'] || '';
    setSelectedDomains(saved1A3 ? saved1A3.split(',').map(s => s.trim()) : [], 'tform1A3');

    const saved3A3 = data['scope_3A3'] || '';
    setSelectedDomains(saved3A3 ? saved3A3.split(',').map(s => s.trim()) : [], 'tform3A3');

    tformUpdateProgress();

    document.querySelectorAll('#trainingForm input, #trainingForm textarea, #trainingForm select, #trainingForm .toggle-switch').forEach(el => {
        el.disabled = archived;
        el.style.opacity = archived ? '0.6' : '1';
        el.style.cursor = archived ? 'not-allowed' : 'text';
    });

    // Re-apply admin header lock after loading data (in case archived logic overrode it)
    if (currentRole === 'admin') {
        applyHeaderGridLock(true);
        restrictAdminSignatures();
    }
}

function checkSignatureStatus() {
    const sai = document.getElementById('tform-sig-sai').value.trim();
    const saiDate = document.getElementById('tform-sig-sai-date').value;
    const lilly = document.getElementById('tform-sig-lilly').value.trim();
    const lillyDate = document.getElementById('tform-sig-lilly-date').value;
    const abishith = document.getElementById('tform-sig-abishith').value.trim();
    const abishithDate = document.getElementById('tform-sig-abishith-date').value;

    const saiComplete = sai && saiDate;
    const lillyComplete = lilly && lillyDate;
    const abishithComplete = abishith && abishithDate;

    const saiStatus = document.getElementById('sig-status-sai');
    const lillyStatus = document.getElementById('sig-status-lilly');
    const abishithStatus = document.getElementById('sig-status-abishith');

    if (saiStatus) {
        saiStatus.textContent = saiComplete ? ` Signed: ${sai} (${saiDate})` : ' Pending';
        saiStatus.className = 'sig-status ' + (saiComplete ? 'signed' : 'pending');
    }
    if (lillyStatus) {
        lillyStatus.textContent = lillyComplete ? ` Signed: ${lilly} (${lillyDate})` : ' Pending';
        lillyStatus.className = 'sig-status ' + (lillyComplete ? 'signed' : 'pending');
    }
    if (abishithStatus) {
        abishithStatus.textContent = abishithComplete ? ` Signed: ${abishith} (${abishithDate})` : ' Pending';
        abishithStatus.className = 'sig-status ' + (abishithComplete ? 'signed' : 'pending');
    }

    const banner = document.getElementById('signatureBanner');
    if (!banner) return saiComplete && lillyComplete && abishithComplete;
    if (currentRole === 'admin') {
        banner.style.display = 'none';
        return saiComplete && lillyComplete && abishithComplete;
    } else {
        banner.style.display = '';
    }
    if (saiComplete && lillyComplete && abishithComplete) {
        banner.textContent = ' COMPLETE: All 3 signatories have signed and dated the report';
        banner.className = 'signature-status-banner complete';
        return true;
    }
    const missing = [];
    if (!abishithComplete) missing.push('Abishith Rao (Author | Founder & CEO)');
    if (!lillyComplete) missing.push('Lilly John (Team HR)');
    if (!saiComplete) missing.push('Sai Kumar (Team L&D)');
    banner.textContent = ' PENDING: ' + missing.join(', ') + ' need to sign and date';
    banner.className = 'signature-status-banner pending';
    return false;
}

function showAutoSaveToast(message = 'Saved', icon = 'check-circle', color = '#22c55e') {
    const toast = document.getElementById('autosaveToast');
    const msg = document.getElementById('autosaveToastMsg');
    if (!toast) return;
    if (msg) msg.textContent = message;
    const iconEl = toast.querySelector('i');
    if (iconEl) {
        iconEl.className = `fas fa-${icon}`;
        iconEl.style.color = color;
    }
    clearTimeout(toast._hideTimer);
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';
    toast._hideTimer = setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(12px)';
    }, 2200);
}

async function pushToWebhookSilent(data, college, program) {
    const url = localStorage.getItem('tms_webhook_url');
    if (!url) return;
    try {
        const items = document.querySelectorAll('#trainingForm .toggle-switch[data-item]');
        const totalCount = items.length;
        const completeCount = Array.from(items).filter(el => el.checked).length;
        const percent = totalCount ? Math.round((completeCount / totalCount) * 100) : 0;
        const payload = {
            collegeName: college.name || data.collegeName || '',
            programName: program.name || '',
            createdBy: college.createdBy || 'Admin',
            semesterBatch: data.semesterBatch || '',
            trainingDomain: data.trainingDomain || '',
            trainingDates: data.trainingDates || '',
            totalHours: data.totalHours || '',
            isArchived: program.isArchived || false,
            completedCount: completeCount,
            pendingCount: totalCount - completeCount,
            totalCount: totalCount,
            completionPercent: percent + '%',
            sigSai: data['sig-sai'] || '',
            sigLilly: data['sig-lilly'] || '',
            sigAbishith: data['sig-abishith'] || '',
            lastEditedBy: data.lastEditedBy || '',
            lastEditedAt: data.lastEditedAt || '',
            unfilledFields: data.unfilledFields || 'None'
        };
        await fetch(url, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
    } catch (e) {
        // Silent fail — don't interrupt user
        console.warn('Webhook push failed silently:', e);
    }
}

function getLabelText(el) {
    if (el.classList.contains('toggle-switch')) {
        const parent = el.closest('.toggle-item');
        if (parent) {
            const labelSpan = parent.querySelector('.label-text');
            if (labelSpan) {
                return labelSpan.textContent.trim().replace(/\s+/g, ' ');
            }
        }
    } else if (el.classList.contains('sub-checkbox')) {
        const parentLabel = el.closest('label');
        if (parentLabel) {
            const span = parentLabel.querySelector('span');
            if (span) {
                return span.textContent.trim().replace(/\s+/g, ' ');
            }
        }
    }
    return el.dataset.item;
}

function saveCurrentProgram(silent = false) {
    if (!currentCollegeId || !currentProgramId) {
        if (!silent) showAutoSaveToast('No program selected', 'exclamation-circle', '#f59e0b');
        return;
    }
    const college = colleges[currentCollegeId];
    const program = college?.programs?.[currentProgramId];
    if (!program) {
        if (!silent) showAutoSaveToast('Program not found', 'exclamation-circle', '#ef4444');
        return;
    }
    if (program.isArchived) {
        if (!silent) showAutoSaveToast('Archived — cannot edit', 'lock', '#6b7280');
        return;
    }
    const data = {};
    data.collegeName = document.getElementById('tform-collegeName').value;
    data.semesterBatch = document.getElementById('tform-semesterBatch').value;
    data.trainingDomain = document.getElementById('tform-trainingDomain').value;
    data.trainingDomainArray = data.trainingDomain ? data.trainingDomain.split(',').map(item => item.trim()).filter(Boolean) : [];
    data.trainingDates = document.getElementById('tform-trainingDates').value;
    data.totalHours = document.getElementById('tform-totalHours').value;
    data.trainerTrainee = document.getElementById('tform-trainerTrainee').value;

    document.querySelectorAll('#trainingForm .toggle-switch[data-item]').forEach(el => {
        data[el.dataset.item] = el.checked;
    });

    document.querySelectorAll('#trainingForm .sub-checkbox[data-item]').forEach(el => {
        data[el.dataset.item] = el.checked;
    });

    document.querySelectorAll('#trainingForm .toggle-switch[data-target]').forEach(el => {
        data['master_' + el.dataset.target] = el.checked;
    });

    document.querySelectorAll('#trainingForm [data-comment]').forEach(el => {
        data['comment_' + el.dataset.comment] = el.value;
    });

    document.querySelectorAll('#trainingForm [data-employee]').forEach(el => {
        if (el.classList.contains('employee-checkboxes')) {
            const selectedIds = Array.from(el.querySelectorAll('input[type=checkbox][data-employee-checkbox]:checked')).map(cb => cb.value);
            data['employee_' + el.dataset.employee] = selectedIds.join(', ');
        } else {
            data['employee_' + el.dataset.employee] = el.value;
        }
    });

    // Read signatures from the DOM regardless of role to keep them intact
    data['sig-sai'] = document.getElementById('tform-sig-sai') ? document.getElementById('tform-sig-sai').value : '';
    data['sig-sai-date'] = document.getElementById('tform-sig-sai-date') ? document.getElementById('tform-sig-sai-date').value : '';
    data['sig-lilly'] = document.getElementById('tform-sig-lilly') ? document.getElementById('tform-sig-lilly').value : '';
    data['sig-lilly-date'] = document.getElementById('tform-sig-lilly-date') ? document.getElementById('tform-sig-lilly-date').value : '';
    data['sig-abishith'] = document.getElementById('tform-sig-abishith') ? document.getElementById('tform-sig-abishith').value : '';
    data['sig-abishith-date'] = document.getElementById('tform-sig-abishith-date') ? document.getElementById('tform-sig-abishith-date').value : '';

    // Calculate metadata audit fields
    data.lastEditedBy = currentRole === 'employee' ? `${currentEmployeeName} (${currentEmployeeId})` : (currentRole === 'admin' ? 'Admin' : 'Unknown');
    data.lastEditedAt = new Date().toLocaleString();

    const unfilled = [];
    if (!data.collegeName) unfilled.push("College Name");
    if (!data.semesterBatch) unfilled.push("Semester & Batch");
    if (!data.trainingDomain) unfilled.push("Training Domain");
    if (!data.trainingDates) unfilled.push("Training Dates");
    if (!data.totalHours) unfilled.push("Total Hours");
    if (!data.trainerTrainee) unfilled.push("Trainers / Trainees");

    // Collect unchecked checklist items
    document.querySelectorAll('#trainingForm .toggle-switch[data-item]').forEach(el => {
        if (!el.checked) {
            unfilled.push(getLabelText(el));
        }
    });
    document.querySelectorAll('#trainingForm .sub-checkbox[data-item]').forEach(el => {
        if (!el.checked) {
            unfilled.push(getLabelText(el));
        }
    });

    // Check signature fields
    if (!data['sig-sai']) unfilled.push("Sai Kumar Signature");
    if (!data['sig-lilly']) unfilled.push("Lilly John Signature");
    if (!data['sig-abishith']) unfilled.push("Abishith Rao Signature");

    data.unfilledFields = unfilled.length > 0 ? unfilled.join(', ') : 'None';

    if (currentRole === 'employee' && currentEmployeeId) {
        // also keep a shared formData copy so admin can see the latest submitted details
        program.formData = data;
    }

    data['scope_1A3'] = getSelectedDomains('tform1A3').join(', ');
    data['scope_3A3'] = getSelectedDomains('tform3A3').join(', ');

    setSavedProgramData(program, data);
    saveData();
    renderProgramSelector();
    if (currentRole === 'admin') checkSignatureStatus();

    // Autosave toast + webhook sync for employees
    if (currentRole === 'employee') {
        showAutoSaveToast('Autosaved ✓');
        pushToWebhookSilent(data, college, program);
    }
}

function markCompleteAndArchive() {
    if (currentRole !== 'admin') {
        alert('Only Admin can archive programs.');
        return;
    }
    if (!currentCollegeId || !currentProgramId) {
        alert('No program selected.');
        return;
    }
    const college = colleges[currentCollegeId];
    const program = college?.programs?.[currentProgramId];
    if (!program) return;
    if (program.isArchived) {
        alert('This program is already archived.');
        return;
    }
    if (!checkSignatureStatus()) {
        alert('All 3 signatories must sign and date before archiving.');
        return;
    }
    saveCurrentProgram();
    program.isArchived = true;
    saveData();
    renderProgramSelector();
    alert(' Program archived successfully.');
}

function clearForm() {
    document.querySelectorAll('#trainingForm input, #trainingForm textarea, #trainingForm select').forEach(el => {
        if (!el.dataset.employee && el.type !== 'button' && el.type !== 'submit') el.value = '';
    });
    document.querySelectorAll('#trainingForm [data-employee]').forEach(el => {
        if (el.classList.contains('employee-checkboxes')) {
            el.querySelectorAll('input[type=checkbox]').forEach(cb => cb.checked = false);
        } else {
            el.value = '';
        }
    });
    document.querySelectorAll('#trainingForm .toggle-switch').forEach(el => {
        el.checked = false;
        el.classList.remove('active');
    });
    document.querySelectorAll('#trainingForm .toggle-status, #trainingForm .master-status').forEach(el => {
        el.textContent = 'Not Done';
        el.className = el.className.includes('master-status') ? 'master-status notdone' : 'toggle-status notdone';
    });
    const domainDisplay = document.getElementById('tformSelectedDomainTags');
    if (domainDisplay) domainDisplay.innerHTML = '';
    const placeholder = document.getElementById('tformDomainPlaceholder');
    if (placeholder) placeholder.style.display = 'block';
    if (currentRole === 'admin') {
        document.querySelectorAll('.sig-status').forEach(el => {
            el.textContent = ' Pending';
            el.className = 'sig-status pending';
        });
        const banner = document.getElementById('signatureBanner');
        if (banner) {
            banner.textContent = ' PENDING: All 3 signatories must sign and date to complete the report';
            banner.className = 'signature-status-banner pending';
        }
    }
    setSelectedDomains([], 'tform1A3');
    setSelectedDomains([], 'tform3A3');
    tformUpdateProgress();
}

function tformToggleItem(el) {
    // Disable for admin (view-only)
    if (currentRole === 'admin') {
        el.checked = !el.checked;
        return;
    }
    if (isProgramArchived()) {
        el.checked = !el.checked;
        return;
    }
    const key = el.dataset.item;
    const active = el.checked;

    // Enforce Completed By is mandatory before marking Done
    const parts = key.split('-');
    const subsectionId = parts[0]; // e.g. "1A"
    const empSelectDiv = document.getElementById(`empSelect-${subsectionId}`);
    if (active && empSelectDiv) {
        const checkedEmployees = empSelectDiv.querySelectorAll('input[type=checkbox][data-employee-checkbox]:checked');
        if (checkedEmployees.length === 0) {
            alert(`Please select at least one employee in "Completed By" for this section before marking items as Done.`);
            el.checked = false;
            return;
        }
    }

    // Special handling for scope-dropdown items (1A-3 and 3A-3)
    const scopeMap = {
        '1A-3': { prefix: 'tform1A3', dropdownId: 'tform1A3DomainDropdown' },
        '3A-3': { prefix: 'tform3A3', dropdownId: 'tform3A3DomainDropdown' }
    };
    if (scopeMap[key]) {
        const { prefix, dropdownId } = scopeMap[key];
        if (active) {
            // Open dropdown for the user to select — don't mark Done yet
            el.checked = false; // keep unchecked until a scope is chosen
            el.classList.remove('active');
            const dropdown = document.getElementById(dropdownId);
            if (dropdown) dropdown.classList.add('open');
        } else {
            // Unchecking: clear all scope selections and reset to Not Done
            const checkboxes = document.querySelectorAll(`#${dropdownId} input[type=checkbox]`);
            checkboxes.forEach(cb => { cb.checked = false; });
            updateDomainSelection(prefix);
            el.classList.remove('active');
            const status = document.getElementById('tform-itemStatus-' + key);
            if (status) {
                status.textContent = 'Not Done';
                status.className = 'toggle-status notdone';
            }
            tformUpdateMasterToggle(el);
            tformUpdateProgress();
            setTimeout(saveCurrentProgram, 300);
        }
        return;
    }

    el.classList.toggle('active', active);
    const status = document.getElementById('tform-itemStatus-' + key);
    if (status) {
        status.textContent = active ? 'Done' : 'Not Done';
        status.className = 'toggle-status ' + (active ? 'done' : 'notdone');
    }

    // Automatically toggle child sub-checkboxes if any exist
    const subCbs = document.querySelectorAll(`#trainingForm .sub-checkbox[data-item^="${key}-"]`);
    subCbs.forEach(cb => {
        cb.checked = active;
    });

    tformUpdateMasterToggle(el);
    tformUpdateProgress();
    setTimeout(saveCurrentProgram, 300);
}

function tformToggleSubItem(el) {
    // Disable for admin (view-only)
    if (currentRole === 'admin') {
        el.checked = !el.checked;
        return;
    }
    if (isProgramArchived()) {
        el.checked = !el.checked;
        return;
    }

    // Find parent item ID (e.g. from "3H-2-1" get "3H-2")
    const childKey = el.dataset.item;
    const parts = childKey.split('-');
    if (parts.length >= 3) {
        const parentKey = parts[0] + '-' + parts[1]; // e.g. "3H-2"
        const parentEl = document.querySelector(`#trainingForm .toggle-switch[data-item="${parentKey}"]`);
        if (parentEl) {
            // Find all siblings (sub-checkboxes for this parent)
            const siblings = document.querySelectorAll(`#trainingForm .sub-checkbox[data-item^="${parentKey}-"]`);
            const allChecked = Array.from(siblings).every(cb => cb.checked);

            // Update parent toggle state
            if (parentEl.checked !== allChecked) {
                parentEl.checked = allChecked;
                parentEl.classList.toggle('active', allChecked);
                const parentStatus = document.getElementById('tform-itemStatus-' + parentKey);
                if (parentStatus) {
                    parentStatus.textContent = allChecked ? 'Done' : 'Not Done';
                    parentStatus.className = 'toggle-status ' + (allChecked ? 'done' : 'notdone');
                }
                tformUpdateMasterToggle(parentEl);
                tformUpdateProgress();
            }
        }
    }
    setTimeout(saveCurrentProgram, 300);
}

function tformToggleMaster(el) {
    // Disable for admin (view-only)
    if (currentRole === 'admin') {
        el.checked = !el.checked;
        return;
    }
    if (isProgramArchived()) {
        el.checked = !el.checked;
        return;
    }
    const active = el.checked;

    // Enforce Completed By is mandatory before marking Done
    const subsectionId = el.dataset.target;
    const empSelectDiv = document.getElementById(`empSelect-${subsectionId}`);
    if (active && empSelectDiv) {
        const checkedEmployees = empSelectDiv.querySelectorAll('input[type=checkbox][data-employee-checkbox]:checked');
        if (checkedEmployees.length === 0) {
            alert(`Please select at least one employee in "Completed By" for this section before marking items as Done.`);
            el.checked = false;
            return;
        }
    }
    el.classList.toggle('active', active);
    const status = document.getElementById('tform-masterStatus-' + el.dataset.target);
    if (status) {
        status.textContent = active ? 'Done' : 'Not Done';
        status.className = 'master-status ' + (active ? 'done' : 'notdone');
    }
    const checklist = document.querySelector('#trainingForm .checklist[data-subsection="' + el.dataset.target + '"]');
    if (checklist) {
        checklist.querySelectorAll('.toggle-switch[data-item]').forEach(item => {
            item.checked = active;
            item.classList.toggle('active', active);
            const statusItem = document.getElementById('tform-itemStatus-' + item.dataset.item);
            if (statusItem) {
                statusItem.textContent = active ? 'Done' : 'Not Done';
                statusItem.className = 'toggle-status ' + (active ? 'done' : 'notdone');
            }
        });
    }
    tformUpdateProgress();
    setTimeout(saveCurrentProgram, 300);
}

function tformSetAll(subsectionId, state) {
    // Disable for admin (view-only)
    if (currentRole === 'admin') return;
    if (isProgramArchived()) return;

    // Enforce Completed By is mandatory before marking Done
    if (state) {
        const empSelectDiv = document.getElementById(`empSelect-${subsectionId}`);
        if (empSelectDiv) {
            const checkedEmployees = empSelectDiv.querySelectorAll('input[type=checkbox][data-employee-checkbox]:checked');
            if (checkedEmployees.length === 0) {
                alert(`Please select at least one employee in "Completed By" for this section before marking items as Done.`);
                return;
            }
        }
    }

    const checklist = document.querySelector('#trainingForm .checklist[data-subsection="' + subsectionId + '"]');
    if (!checklist) return;
    checklist.querySelectorAll('.toggle-switch[data-item]').forEach(item => {
        item.checked = state;
        item.classList.toggle('active', state);
        const statusItem = document.getElementById('tform-itemStatus-' + item.dataset.item);
        if (statusItem) {
            statusItem.textContent = state ? 'Done' : 'Not Done';
            statusItem.className = 'toggle-status ' + (state ? 'done' : 'notdone');
        }
    });
    const master = document.querySelector('#trainingForm .toggle-switch[data-target="' + subsectionId + '"]');
    if (master) {
        master.checked = state;
        master.classList.toggle('active', state);
        const statusMaster = document.getElementById('tform-masterStatus-' + subsectionId);
        if (statusMaster) {
            statusMaster.textContent = state ? 'Done' : 'Not Done';
            statusMaster.className = 'master-status ' + (state ? 'done' : 'notdone');
        }
    }
    tformUpdateProgress();
    setTimeout(saveCurrentProgram, 300);
}

function tformUpdateMasterToggle(el) {
    const toggleItem = el.closest('.toggle-item');
    if (!toggleItem) return;
    const checklist = toggleItem.closest('.checklist');
    if (!checklist) return;
    const subsectionId = checklist.dataset.subsection;
    const allItems = checklist.querySelectorAll('.toggle-switch[data-item]');
    const allOn = Array.from(allItems).every(item => item.checked);
    const master = document.querySelector('#trainingForm .toggle-switch[data-target="' + subsectionId + '"]');
    if (master) {
        master.checked = allOn;
        master.classList.toggle('active', allOn);
        const status = document.getElementById('tform-masterStatus-' + subsectionId);
        if (status) {
            status.textContent = allOn ? 'Done' : 'Not Done';
            status.className = 'master-status ' + (allOn ? 'done' : 'notdone');
        }
    }
}

function tformUpdateProgress() {
    const items = document.querySelectorAll('#trainingForm .toggle-switch[data-item]');
    const total = items.length;
    const complete = Array.from(items).filter(item => item.checked).length;
    document.getElementById('tform-totalCount').textContent = total;
    document.getElementById('tform-completedCount').textContent = complete;
    const percent = total ? Math.round((complete / total) * 100) : 0;
    document.getElementById('tform-progressFill').style.width = percent + '%';

    document.querySelectorAll('#trainingForm .section[data-section]').forEach(section => {
        const sectionId = section.dataset.section;
        const toggles = section.querySelectorAll('.checklist .toggle-switch[data-item]');
        let allComplete = true;
        toggles.forEach(toggle => { if (!toggle.checked) allComplete = false; });
        const status = document.getElementById('tform-sectionStatus-' + sectionId);
        if (status) {
            status.textContent = toggles.length ? (allComplete ? ' Complete' : ' In Progress') : ' No items';
            status.className = 'section-status ' + (allComplete ? 'complete' : 'incomplete');
        }
    });
    const completedSections = document.querySelectorAll('#trainingForm .section-status.complete').length;
    const totalSections = document.querySelectorAll('#trainingForm .section-status').length;
    document.getElementById('tform-sectionCompleteCount').textContent = completedSections;
    document.getElementById('tform-totalSectionCount').textContent = totalSections;
}

function isProgramArchived() {
    if (!currentCollegeId || !currentProgramId) return false;
    return colleges[currentCollegeId]?.programs?.[currentProgramId]?.isArchived || false;
}

function toggleDomainDropdown(prefix = '') {
    const dropdown = document.getElementById(prefix ? `${prefix}DomainDropdown` : 'domainDropdown');
    if (!dropdown) return;
    dropdown.classList.toggle('open');
}

function updateDomainSelection(prefix = '') {
    const dropdownId = prefix ? `${prefix}DomainDropdown` : 'domainDropdown';
    const placeholderId = prefix ? `${prefix}DomainPlaceholder` : 'domainPlaceholder';
    const tagsId = prefix ? `${prefix}SelectedDomainTags` : 'selectedDomainTags';
    const trainingDomainId = prefix === 'tform' ? 'tform-trainingDomain' : (prefix ? `${prefix}TrainingDomain` : 'newProgramTrainingDomain');
    const checkboxes = document.querySelectorAll(`#${dropdownId} input[type=checkbox]`);
    const selected = [];
    checkboxes.forEach(cb => { if (cb.checked) selected.push(cb.value); });
    const placeholder = document.getElementById(placeholderId);
    const tags = document.getElementById(tagsId);
    const domainInput = document.getElementById(trainingDomainId);
    if (selected.length === 0) {
        if (placeholder) placeholder.style.display = 'block';
        if (tags) tags.innerHTML = '';
    } else {
        if (placeholder) placeholder.style.display = 'none';
        if (tags) tags.innerHTML = selected.map(domain => `<span class="tag">${domain}<span class="remove-tag" onclick="event.stopPropagation(); removeDomain('${domain}', '${prefix}')">&times;</span></span>`).join('');
    }
    if (domainInput) domainInput.value = selected.join(', ');

    // Auto-toggle checklist completion if at least one option is selected
    if (prefix === 'tform1A3') {
        const toggle = document.querySelector(`.toggle-switch[data-item="1A-3"]`);
        const statusSpan = document.getElementById('tform-itemStatus-1A-3');
        if (selected.length > 0) {
            // Mark as Done when scope(s) selected
            if (toggle && !toggle.checked) {
                toggle.checked = true;
                toggle.classList.add('active');
            }
            if (statusSpan) {
                statusSpan.textContent = 'Done';
                statusSpan.className = 'toggle-status done';
            }
        } else {
            // No scopes selected — revert to Not Done and uncheck toggle
            if (toggle) {
                toggle.checked = false;
                toggle.classList.remove('active');
            }
            if (statusSpan) {
                statusSpan.textContent = 'Not Done';
                statusSpan.className = 'toggle-status notdone';
            }
        }
        if (toggle) {
            tformUpdateMasterToggle(toggle);
            tformUpdateProgress();
        }
        setTimeout(autoSave, 100);
    }
    if (prefix === 'tform3A3') {
        const toggle = document.querySelector(`.toggle-switch[data-item="3A-3"]`);
        const statusSpan = document.getElementById('tform-itemStatus-3A-3');
        if (selected.length > 0) {
            // Mark as Done when scope(s) selected
            if (toggle && !toggle.checked) {
                toggle.checked = true;
                toggle.classList.add('active');
            }
            if (statusSpan) {
                statusSpan.textContent = 'Done';
                statusSpan.className = 'toggle-status done';
            }
        } else {
            // No scopes selected — revert to Not Done and uncheck toggle
            if (toggle) {
                toggle.checked = false;
                toggle.classList.remove('active');
            }
            if (statusSpan) {
                statusSpan.textContent = 'Not Done';
                statusSpan.className = 'toggle-status notdone';
            }
        }
        if (toggle) {
            tformUpdateMasterToggle(toggle);
            tformUpdateProgress();
        }
        setTimeout(autoSave, 100);
    }
}

function removeDomain(domain, prefix = '') {
    const dropdownId = prefix ? `${prefix}DomainDropdown` : 'domainDropdown';
    document.querySelectorAll(`#${dropdownId} input[type=checkbox]`).forEach(cb => {
        if (cb.value === domain) cb.checked = false;
    });
    updateDomainSelection(prefix);
}

function getSelectedDomains(prefix = '') {
    const dropdownId = prefix ? `${prefix}DomainDropdown` : 'domainDropdown';
    const selected = [];
    document.querySelectorAll(`#${dropdownId} input[type=checkbox]`).forEach(cb => {
        if (cb.checked) selected.push(cb.value);
    });
    return selected;
}

function setSelectedDomains(domains, prefix = '') {
    const dropdownId = prefix ? `${prefix}DomainDropdown` : 'domainDropdown';
    document.querySelectorAll(`#${dropdownId} input[type=checkbox]`).forEach(cb => {
        cb.checked = domains.includes(cb.value);
    });
    updateDomainSelection(prefix);
}

function autoSave() {
    if (currentRole === 'admin') return; // Admin cannot edit form fields
    clearTimeout(window._autoSaveTimer);
    window._autoSaveTimer = setTimeout(() => {
        if (currentCollegeId && currentProgramId) saveCurrentProgram(true);
    }, 600);
}
function showSaveMismatchBanner(found, data) {
    const banner = document.getElementById('saveMismatchBanner');
    const message = document.getElementById('saveMismatchMessage');
    if (!banner || !message) return;
    message.textContent = `Warning: Program "${found.program.name || found.programId}" appears to belong to "${colleges[found.collegeId].name}".`;
    banner.style.display = 'flex';
    document.getElementById('saveMismatchProceed').onclick = saveToFoundCollege;
    document.getElementById('saveMismatchCancel').onclick = hideSaveMismatchBanner;
    window._pendingSave = { found, data };
}

function hideSaveMismatchBanner() {
    const banner = document.getElementById('saveMismatchBanner');
    if (!banner) return;
    banner.style.display = 'none';
    window._pendingSave = null;
}

function saveToFoundCollege() {
    if (!window._pendingSave) return;
    const { found, data } = window._pendingSave;
    const program = colleges[found.collegeId]?.programs?.[found.programId];
    if (!program) {
        alert('Target program not found.');
        hideSaveMismatchBanner();
        return;
    }
    setSavedProgramData(program, data);
    saveData();
    hideSaveMismatchBanner();
    alert(' Saved to the correct college.');
}

// ===== AUTOSAVE: listen to ALL form changes for employee =====
document.addEventListener('input', e => {
    if (currentRole !== 'employee') return;
    if (isProgramArchived()) return;
    const target = e.target;
    if (!target) return;
    // Only trigger for elements inside the training form
    if (target.closest('#trainingForm')) {
        autoSave();
    }
});

document.addEventListener('change', e => {
    if (e.target && e.target.id && e.target.id.startsWith('tform-sig-')) {
        checkSignatureStatus();
        if (currentRole === 'admin') saveCurrentProgram(true);
    }
    // Also autosave on select/checkbox changes inside the form for employee
    if (currentRole !== 'employee') return;
    if (isProgramArchived()) return;
    if (e.target && e.target.closest && e.target.closest('#trainingForm')) {
        autoSave();
    }
});

document.addEventListener('click', e => {
    // Close other employee dropdowns if clicked outside
    document.querySelectorAll('.employee-multiselect-container').forEach(container => {
        if (!container.contains(e.target)) {
            const dropdown = container.querySelector('.employee-dropdown-options');
            if (dropdown) dropdown.style.display = 'none';
        }
    });

    if (e.target.closest('.toggle-switch')) {
        setTimeout(autoSave, 100);
    }
    const formContainer = document.getElementById('tformDomainMultiSelect');
    if (formContainer && !formContainer.contains(e.target)) {
        const dropdown = document.getElementById('tformDomainDropdown');
        if (dropdown) dropdown.classList.remove('open');
    }
    const dashboardContainer = document.getElementById('domainMultiSelect');
    if (dashboardContainer && !dashboardContainer.contains(e.target)) {
        const dropdown = document.getElementById('domainDropdown');
        if (dropdown) dropdown.classList.remove('open');
    }
    const formContainer1A3 = document.getElementById('tform1A3DomainMultiSelect');
    if (formContainer1A3 && !formContainer1A3.contains(e.target)) {
        const dropdown = document.getElementById('tform1A3DomainDropdown');
        if (dropdown) dropdown.classList.remove('open');
    }
    const formContainer3A3 = document.getElementById('tform3A3DomainMultiSelect');
    if (formContainer3A3 && !formContainer3A3.contains(e.target)) {
        const dropdown = document.getElementById('tform3A3DomainDropdown');
        if (dropdown) dropdown.classList.remove('open');
    }
});

window.addEventListener('DOMContentLoaded', async () => {
    if (document.getElementById('loginPage')) await initLoginPage();
    if (document.getElementById('dashboardPage')) await initDashboardPage();
    if (document.getElementById('programPage')) await initProgramPage();
});
