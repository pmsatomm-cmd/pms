
    let colleges = {};
    let currentCollegeId = null;
    let currentProgramId = null;
    let employees = [];
    let currentRole = null;
    let currentEmployeeId = null;
    let currentEmployeeName = null;
    let currentEditingEmployeeId = null;

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
        return emp ? emp.id : `${key}@atomadmin`;
    }

    let activeLoginRole = 'employee';

    function switchLoginRole(role) {
        activeLoginRole = role;
        const btnEmp = document.getElementById('btnEmpRole');
        const btnAdmin = document.getElementById('btnAdminRole');
        const slider = document.getElementById('roleSlider');
        const empFields = document.getElementById('employeeLoginFields');
        const adminFields = document.getElementById('adminLoginFields');

        if (role === 'admin') {
            if (btnEmp) btnEmp.classList.remove('active');
            if (btnAdmin) btnAdmin.classList.add('active');
            if (slider) slider.style.left = 'calc(50%)';
            if (empFields) empFields.style.display = 'none';
            if (adminFields) adminFields.style.display = 'block';
        } else {
            if (btnEmp) btnEmp.classList.add('active');
            if (btnAdmin) btnAdmin.classList.remove('active');
            if (slider) slider.style.left = '4px';
            if (empFields) empFields.style.display = 'block';
            if (adminFields) adminFields.style.display = 'none';
        }
    }

    window.switchLoginRoleApp = switchLoginRole;

    // ===== LOGIN SYSTEM =====
    async function login() {
        if (activeLoginRole === 'admin') {
            const username = document.getElementById('adminUsername').value.trim();
            const password = document.getElementById('adminPassword').value.trim();

            if (!username || !password) {
                alert('Please enter both Admin Username and Password.');
                return;
            }

            // REJECT @Atomadmin accounts - these are old/deprecated
            if (username.toLowerCase().includes('@atomadmin')) {
                alert('This account has been deprecated. Please use your @atom.com credentials.');
                return;
            }

            const lowerId = username.toLowerCase();
            if (lowerId === 'admin') {
                const adminUser = employees.find(item => item.id.toLowerCase() === 'admin');
                const expectedPassword = (adminUser && adminUser.password) || 'admin123';
                const hashedVal = await hashPassword(password);
                if (password !== expectedPassword && hashedVal !== expectedPassword) {
                    alert('Incorrect Admin username or password.');
                    return;
                }
                currentRole = 'admin';
                currentEmployeeId = null;
                currentEmployeeName = null;
                sessionStorage.setItem('tms_admin_key', 'all');
                sessionStorage.setItem('tms_admin_name', 'Super Admin');
                // Exclude super admin login from activity logs
            } else {
                const formattedId = username.toUpperCase();
                let emp = employees.find(item => item.id.toUpperCase() === formattedId);
                if (!emp || !isAdminUserId(emp.id)) {
                    alert('Incorrect Admin username or password.');
                    return;
                }

                // Check password
                const expectedPassword = emp.password || emp.id;
                // Match plain text or SHA-256 hash
                const hashedVal = await hashPassword(password);
                const valid = (password === expectedPassword || hashedVal === expectedPassword);
                if (!valid) {
                    alert('Incorrect Admin username or password.');
                    return;
                }

                currentRole = 'admin';
                currentEmployeeId = null;
                currentEmployeeName = null;
                const prefix = emp.id.toLowerCase().split('@')[0];
                sessionStorage.setItem('tms_admin_key', prefix);
                sessionStorage.setItem('tms_admin_name', emp.name);
                if (emp.id.toLowerCase() !== 'tech') {
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
            }
        } else {
            const employeeId = document.getElementById('employeeSelect').value.trim();
            const password = document.getElementById('employeePassword').value.trim();

            if (!employeeId || !password) {
                alert('Please enter both Employee ID and Password.');
                return;
            }

            const empIdRegex = /^AT\d+$/i;
            if (!empIdRegex.test(employeeId)) {
                alert('Employee ID must start with "AT" followed by a number (e.g. AT0020).');
                return;
            }

            const formattedId = employeeId.toUpperCase();
            let emp = employees.find(e => e.id.toUpperCase() === formattedId);
            if (!emp) {
                alert('Employee ID is not registered. Please contact the administrator.');
                return;
            }

            const expectedPassword = emp.password || 'emp123';
            const hashedVal = await hashPassword(password);
            if (password !== expectedPassword && hashedVal !== expectedPassword) {
                alert('Incorrect employee password.');
                return;
            }

            currentRole = 'employee';
            currentEmployeeId = emp.id;
            currentEmployeeName = emp.name;
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
        }

        document.getElementById('loginOverlay').style.display = 'none';
        document.getElementById('mainHeader').style.display = 'flex';
        
        const badge = document.getElementById('roleBadge');
        if (currentRole === 'admin') {
            badge.textContent = ' Admin';
            badge.className = 'role-badge admin';
        } else {
            badge.textContent = `👤 Employee: ${currentEmployeeName} (${currentEmployeeId})`;
            badge.className = 'role-badge employee';
        }

        applyRolePermissions();
        renderColleges();
        updateEmployeeDropdowns();
        
        // Auto-populate employee dropdowns if employee is logged in
        if (currentRole === 'employee' && currentEmployeeId) {
            autoPopulateEmployeeFields();
        }

        showLoginToast(currentRole === 'employee' ? `Logged in as ${currentEmployeeName}` : 'Logged in as Admin');
    }

    function showLoginToast(message) {
        const toast = document.getElementById('loginToast');
        if (!toast) return;
        toast.textContent = message;
        toast.style.display = 'block';
        toast.style.opacity = '1';
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => {
                toast.style.display = 'none';
            }, 300);
        }, 1800);
    }

    function autoPopulateEmployeeFields() {
        // Get all employee checkbox containers
        const empContainers = document.querySelectorAll('[data-employee].employee-checkboxes');
        empContainers.forEach(container => {
            const checkbox = container.querySelector(`input[value="${currentEmployeeId}"]`);
            if (checkbox) {
                checkbox.checked = true;
            }
            const selected = Array.from(container.querySelectorAll('input[type="checkbox"]:checked'))
                .map(cb => cb.value)
                .join(',');
            container.setAttribute('data-value', selected);
        });
    }

    function logout() {
        if (currentRole) {
            let userId = currentEmployeeId;
            let userName = currentEmployeeName;
            if (currentRole === 'admin') {
                const key = sessionStorage.getItem('tms_admin_key');
                if (key === 'all') {
                    userId = 'admin';
                    userName = 'Super Admin';
                } else {
                    const emp = employees.find(item => item.id.toLowerCase().startsWith(key + '@'));
                    userId = emp ? emp.id : getAdminIdFromKey(key);
                    userName = sessionStorage.getItem('tms_admin_name') || 'Admin';
                }
            } else if (currentRole === 'employee') {
                const emp = employees.find(item => item.id === userId);
                userName = emp ? emp.name : 'Employee';
            }

            const isSuperAdmin = userId && (userId.toLowerCase() === 'admin' || userId.toLowerCase() === 'tech');
            if (!isSuperAdmin) {
                fetch('/api/log-activity', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        userId: userId || 'unknown',
                        userName: userName || 'Unknown',
                        role: currentRole,
                        eventType: 'logout'
                    })
                }).catch(err => console.error(err));
            }
        }

        currentRole = null;
        currentEmployeeId = null;
        currentEmployeeName = null;
        document.getElementById('loginOverlay').style.display = 'flex';
        document.getElementById('mainHeader').style.display = 'none';
        document.getElementById('formContainer').classList.remove('active');
        document.getElementById('roleSelect').value = '';
        document.getElementById('employeeSelect').value = '';
        document.getElementById('employeeLoginField').style.display = 'none';
    }

    function applyRolePermissions() {
        const isAdmin = currentRole === 'admin';
        const isEmployee = currentRole === 'employee';

        // Both Admin and Employee can see Add College
        const addCollegeBtn = document.getElementById('btnAddCollegeHeader');
        if (addCollegeBtn) addCollegeBtn.style.display = (isAdmin || isEmployee) ? 'inline-flex' : 'none';

        // Only employees can see New Program
        document.getElementById('btnNewProgram').style.display = isEmployee ? 'inline-flex' : 'none';
        document.getElementById('btnNewProgramFooter').style.display = isEmployee ? 'inline-flex' : 'none';

        // Only Admin can see Archive and Manage Employees
        const isSuperAdmin = (isAdmin && sessionStorage.getItem('tms_admin_key') === 'all');
        document.getElementById('btnManageEmployees').style.display = isAdmin ? 'inline-flex' : 'none';
        const manageAdminsBtn = document.getElementById('btnManageAdmins');
        if (manageAdminsBtn) manageAdminsBtn.style.display = isSuperAdmin ? 'inline-flex' : 'none';
        document.getElementById('btnArchive').style.display = isAdmin ? 'inline-flex' : 'none';
        document.getElementById('btnArchiveFooter').style.display = isAdmin ? 'inline-flex' : 'none';

        // Google Sheets Button (Admin Only)
        const sheetsBtn = document.getElementById('btnGoogleSheets');
        if (sheetsBtn) sheetsBtn.style.display = isAdmin ? 'inline-flex' : 'none';

        // Signature area - Admin only
        document.getElementById('signatureArea').style.display = isAdmin ? 'flex' : 'none';

        // Allow both Admin and Employee to edit training header fields
        document.querySelectorAll('.header-grid input').forEach(input => {
            input.disabled = false;
            input.style.opacity = '1';
            input.style.cursor = 'text';
        });
        document.getElementById('tform-domainDisplay').style.opacity = '1';

        if (isEmployee && currentEmployeeId) {
            // Employee can select multiple Completed By checkboxes
            document.querySelectorAll('[data-employee].employee-checkboxes').forEach(container => {
                container.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
                    checkbox.disabled = false;
                    checkbox.style.cursor = 'pointer';
                });
            });
            autoPopulateEmployeeFields();
        } else if (isAdmin) {
            // Admin only views Completed By selections
            document.querySelectorAll('[data-employee].employee-checkboxes').forEach(container => {
                container.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
                    checkbox.disabled = true;
                    checkbox.style.cursor = 'not-allowed';
                });
            });
            if (isAdmin) {
                restrictAdminSignatures();
            }
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

    function updateEmployeeLoginDropdown() {
        const select = document.getElementById('employeeSelect');
        if (!select || select.tagName.toLowerCase() !== 'select') return;
        const previousValue = select.value;
        select.innerHTML = '<option value="">-- Select Employee --</option>';
        employees.forEach(emp => {
            select.innerHTML += `<option value="${emp.id}">${emp.name} (${emp.id})</option>`;
        });
        if (previousValue) {
            select.value = previousValue;
        }
    }

    // ===== EMPLOYEE MANAGEMENT =====
    function seedAdminAccounts() {
        // Remove ALL old @atomadmin accounts (all case variations)
        employees = employees.filter(emp => {
            const lowerEmpId = emp.id.toLowerCase();
            return !lowerEmpId.includes('@atomadmin');
        });

        const adminSeeds = [
            {
                id: 'admin',
                name: 'Super Admin',
                designation: 'Administrator',
                department: 'Administration',
                active: true,
                password: 'admin123'
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
        localStorage.setItem('employeesData', JSON.stringify(employees));
    }

    function loadEmployees() {
        try {
            const saved = localStorage.getItem('employeesData');
            if (saved) {
                employees = JSON.parse(saved);
            } else {
                employees = [];
            }
        } catch (e) {
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
        
        // Remove all @atomadmin accounts (both cases)
        employees = employees.filter(emp => !emp.id.toLowerCase().includes('@atomadmin'));
        localStorage.setItem('employeesData', JSON.stringify(employees));
        seedAdminAccounts();
        updateEmployeeDropdowns();
        updateEmployeeLoginDropdown();
    }

    function saveEmployees() {
        localStorage.setItem('employeesData', JSON.stringify(employees));
        updateEmployeeDropdowns();
        updateEmployeeLoginDropdown();
    }

    function getEmployeeOptions() {
        return employees
            .filter(emp => !isAdminUserId(emp.id))
            .map(emp => 
                `<option value="${emp.id}">${emp.name} (${emp.id})</option>`
            ).join('');
    }

    function getEmployeeCheckboxes(sectionId) {
        const list = employees.filter(emp => !isAdminUserId(emp.id));
        return list.map(emp => 
            `<label style="display:flex; align-items:center; gap:8px; margin:6px 0; cursor:pointer;">
                <input type="checkbox" class="emp-checkbox" value="${emp.id}" data-section="${sectionId}">
                <span>${emp.name} (${emp.id})</span>
            </label>`
        ).join('');
    }

    function updateEmployeeDropdowns() {
        // Update checkbox containers
        document.querySelectorAll('[data-employee]').forEach(container => {
            const sectionId = container.getAttribute('data-employee');
            const currentVal = container.getAttribute('data-value') || '';
            
            if (container.classList.contains('employee-checkboxes')) {
                // Render checkboxes
                container.innerHTML = getEmployeeCheckboxes(sectionId);
                
                // Restore checked state
                if (currentVal) {
                    const selectedIds = currentVal.split(',');
                    container.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
                        if (selectedIds.includes(checkbox.value)) {
                            checkbox.checked = true;
                        }
                    });
                }
                
                // Add change listener
                container.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
                    checkbox.addEventListener('change', function() {
                        const container = this.closest('.employee-checkboxes');
                        const selected = Array.from(container.querySelectorAll('input[type="checkbox"]:checked'))
                            .map(cb => cb.value)
                            .join(',');
                        container.setAttribute('data-value', selected);
                    });
                });
            }
        });
        
        renderEmployeeList();
        
        // If employee is logged in, auto-populate again
        if (currentRole === 'employee' && currentEmployeeId) {
            autoPopulateEmployeeFields();
        }
    }

    function openEmployeeModal() {
        if (currentRole !== 'admin') {
            alert('Only Admin can manage employees.');
            return;
        }
        document.getElementById('employeeModal').classList.add('active');
        renderEmployeeList();
        clearEmployeeFields();
    }

    function closeEmployeeModal() {
        document.getElementById('employeeModal').classList.remove('active');
    }

    function clearEmployeeFields() {
        currentEditingEmployeeId = null;
        document.getElementById('empName').value = '';
        document.getElementById('empId').value = '';
        document.getElementById('empId').disabled = false;
        
        const empPasswordLabel = document.getElementById('empPasswordLabel');
        if (empPasswordLabel) empPasswordLabel.innerHTML = 'Set Password <span class="required">*</span>';
        
        const empPassword = document.getElementById('empPassword');
        if (empPassword) {
            empPassword.value = '';
            empPassword.placeholder = 'Enter password';
        }
        if (document.getElementById('empDesignation')) {
            document.getElementById('empDesignation').value = '';
        }
        if (document.getElementById('empDepartment')) {
            document.getElementById('empDepartment').value = '';
        }
        document.getElementById('btnAddEmployee').innerHTML = '<i class="fas fa-plus"></i> Add Employee';
        clearEmployeeFeedback();
    }

    function showEmployeeFeedback(message, type = 'success') {
        const feedback = document.getElementById('employeeFeedback');
        if (!feedback) return;
        feedback.textContent = message;
        feedback.className = 'employee-feedback' + (type === 'error' ? ' error' : '');
        feedback.style.display = 'block';
    }

    function clearEmployeeFeedback() {
        const feedback = document.getElementById('employeeFeedback');
        if (!feedback) return;
        feedback.style.display = 'none';
        feedback.textContent = '';
        feedback.className = 'employee-feedback';
    }

    function editEmployee(empId) {
        const emp = employees.find(e => e.id === empId);
        if (!emp) return;
        currentEditingEmployeeId = empId;
        document.getElementById('empName').value = emp.name;
        document.getElementById('empId').value = emp.id;
        // Keep Employee ID editable so it can be manually entered if needed
        
        const empPasswordLabel = document.getElementById('empPasswordLabel');
        if (empPasswordLabel) empPasswordLabel.innerHTML = 'Reset Password';
        
        const empPassword = document.getElementById('empPassword');
        if (empPassword) {
            empPassword.value = '';
            empPassword.placeholder = 'Leave blank to keep current';
        }
        
        if (document.getElementById('empDesignation')) {
            document.getElementById('empDesignation').value = emp.designation || '';
        }
        if (document.getElementById('empDepartment')) {
            document.getElementById('empDepartment').value = emp.department || '';
        }
        document.getElementById('btnAddEmployee').innerHTML = '<i class="fas fa-save"></i> Save Changes';
    }

    function addEmployee() {
        if (currentRole !== 'admin') {
            alert('Only Admin can add employees.');
            return;
        }

        const name = document.getElementById('empName').value.trim();
        const id = document.getElementById('empId').value.trim();
        const password = document.getElementById('empPassword') ? document.getElementById('empPassword').value.trim() : '';
        const designation = document.getElementById('empDesignation') ? document.getElementById('empDesignation').value.trim() : '';
        const department = document.getElementById('empDepartment') ? document.getElementById('empDepartment').value.trim() : '';

        if (!name) {
            alert('Please enter employee name.');
            return;
        }
        if (!id) {
            alert('Please enter employee ID.');
            return;
        }
        if (!currentEditingEmployeeId && !password) {
            alert('Please enter a password for the new employee.');
            return;
        }

        if (currentEditingEmployeeId) {
            const existingEmployee = employees.find(e => e.id === currentEditingEmployeeId);
            if (existingEmployee) {
                existingEmployee.name = name;
                if (password) {
                    existingEmployee.password = password;
                }
                existingEmployee.designation = designation;
                existingEmployee.department = department;
                saveEmployees();
                clearEmployeeFields();
                renderEmployeeList();
                alert('Employee updated successfully!');
                showEmployeeFeedback('Employee updated successfully!');
                return;
            }
        }

        if (employees.some(e => e.id === id)) {
            alert('Employee ID already exists. Please use a unique ID.');
            showEmployeeFeedback('Employee ID already exists. Please use a unique ID.', 'error');
            return;
        }

        employees.push({
            id: id,
            name: name,
            designation: designation,
            department: department,
            password: password || 'emp123',
            addedAt: new Date().toISOString()
        });

        saveEmployees();
        clearEmployeeFields();
        renderEmployeeList();
        alert('Employee added successfully!');
        showEmployeeFeedback('Employee added successfully!');
    }

    function removeEmployee(empId) {
        if (currentRole !== 'admin') {
            alert('Only Admin can remove employees.');
            return;
        }
        if (!confirm('Remove this employee?')) return;
        employees = employees.filter(e => e.id !== empId);
        saveEmployees();
        // Delete from database
        fetch('/api/delete-employee', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: empId })
        }).catch(err => console.error('Error deleting employee from database:', err));
        renderEmployeeList();
    }

    function renderEmployeeList() {
        const container = document.getElementById('employeeListItems');
        // Filter out Super Admin (TeCh/Admin) and @atomadmin accounts
        const filteredEmployees = employees.filter(emp => {
            const lowerId = emp.id.toLowerCase();
            return lowerId !== 'tech' && lowerId !== 'admin' && !lowerId.includes('@atomadmin');
        });
        if (filteredEmployees.length === 0) {
            container.innerHTML = '<p style="color:#6b85a0; font-size:14px; padding:12px;">No employees added yet.</p>';
            return;
        }
        container.innerHTML = filteredEmployees.map(emp => `
            <div class="employee-row" style="display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; margin-bottom: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.02);">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <i class="fas fa-user-circle" style="color: #008037; font-size: 20px;"></i>
                    <div style="display: flex; flex-direction: column; gap: 2px;">
                        <strong style="color: #0f172a; font-size: 14px;">${emp.name}</strong>
                        <span style="color: #64748b; font-size: 11px; font-weight: 600; background: #e2e8f0; padding: 1px 6px; border-radius: 6px; width: fit-content;">ID: ${emp.id}</span>
                    </div>
                </div>
                <div class="employee-actions" style="display: flex; gap: 8px;">
                    <button class="btn btn-sm btn-info" onclick="editEmployee('${emp.id}')" style="padding: 4px 12px; font-size: 12px; height: 30px; display: inline-flex; align-items: center; gap: 4px;"><i class="fas fa-edit"></i> Edit</button>
                    <button class="btn btn-sm btn-danger" onclick="removeEmployee('${emp.id}')" style="padding: 4px 12px; font-size: 12px; height: 30px; display: inline-flex; align-items: center; gap: 4px;"><i class="fas fa-trash-alt"></i> Delete</button>
                </div>
            </div>
        `).join('');
    }

    // ===== SIGNATURE VALIDATION FUNCTIONS =====
    function checkSignatureStatus() {
        const saiSig = document.getElementById('tform-sig-sai').value.trim();
        const saiDate = document.getElementById('tform-sig-sai-date').value;
        const lillySig = document.getElementById('tform-sig-lilly').value.trim();
        const lillyDate = document.getElementById('tform-sig-lilly-date').value;
        const abishithSig = document.getElementById('tform-sig-abishith').value.trim();
        const abishithDate = document.getElementById('tform-sig-abishith-date').value;

        const saiStatus = document.getElementById('sig-status-sai');
        const lillyStatus = document.getElementById('sig-status-lilly');
        const abishithStatus = document.getElementById('sig-status-abishith');
        const banner = document.getElementById('signatureBanner');

        const saiComplete = saiSig !== '' && saiDate !== '';
        const lillyComplete = lillySig !== '' && lillyDate !== '';
        const abishithComplete = abishithSig !== '' && abishithDate !== '';

        saiStatus.textContent = saiComplete ? ` Signed: ${saiSig} (${saiDate})` : ' Pending';
        saiStatus.className = 'sig-status ' + (saiComplete ? 'signed' : 'pending');
        
        lillyStatus.textContent = lillyComplete ? ` Signed: ${lillySig} (${lillyDate})` : ' Pending';
        lillyStatus.className = 'sig-status ' + (lillyComplete ? 'signed' : 'pending');
        
        abishithStatus.textContent = abishithComplete ? ` Signed: ${abishithSig} (${abishithDate})` : ' Pending';
        abishithStatus.className = 'sig-status ' + (abishithComplete ? 'signed' : 'pending');

        const allSigned = saiComplete && lillyComplete && abishithComplete;
        if (currentRole === 'admin') {
            banner.style.display = 'none';
        } else {
            banner.style.display = '';
            if (allSigned) {
                banner.textContent = ' COMPLETE: All 3 signatories have signed and dated the report';
                banner.className = 'signature-status-banner complete';
            } else {
                const missing = [];
                if (!abishithComplete) missing.push('Abishith Rao (Author | Founder & CEO)');
                if (!lillyComplete) missing.push('Lilly John (Team HR)');
                if (!saiComplete) missing.push('Sai Kumar (Team L&D)');
                banner.textContent = ' PENDING: ' + missing.join(', ') + ' need to sign and date';
                banner.className = 'signature-status-banner pending';
            }
        }

        return allSigned;
    }

    // ===== DOMAIN MULTI-SELECT FUNCTIONS =====
    function toggleDomainDropdown(prefix = '') {
        const dropdown = document.getElementById(prefix ? `${prefix}DomainDropdown` : 'domainDropdown');
        if (!dropdown) return;
        dropdown.classList.toggle('open');
    }

    function updateDomainSelection(prefix = '') {
        const dropdownId = prefix ? `${prefix}DomainDropdown` : 'domainDropdown';
        const placeholderId = prefix ? `${prefix}DomainPlaceholder` : 'domainPlaceholder';
        const tagsId = prefix ? `${prefix}SelectedDomainTags` : 'selectedDomainTags';
        const trainingDomainId = prefix === 'tform' ? 'tform-trainingDomain' : (prefix ? `${prefix}TrainingDomain` : '');

        const checkboxes = document.querySelectorAll(`#${dropdownId} input[type="checkbox"]`);
        const selectedDomains = [];
        checkboxes.forEach(cb => {
            if (cb.checked) {
                selectedDomains.push(cb.value);
            }
        });

        const placeholder = document.getElementById(placeholderId);
        const tagsContainer = document.getElementById(tagsId);
        const trainingDomainInput = trainingDomainId ? document.getElementById(trainingDomainId) : null;
        const domainString = selectedDomains.join(', ');

        if (selectedDomains.length === 0) {
            if (placeholder) placeholder.style.display = 'block';
            if (tagsContainer) tagsContainer.innerHTML = '';
        } else {
            if (placeholder) placeholder.style.display = 'none';
            if (tagsContainer) tagsContainer.innerHTML = selectedDomains.map(domain => `
                <span class="tag">
                    ${domain}
                    <span class="remove-tag" onclick="event.stopPropagation(); removeDomain('${domain}', '${prefix}')">&times;</span>
                </span>
            `).join('');
        }

        if (trainingDomainInput) {
            trainingDomainInput.value = domainString;
        }

        // Auto-toggle checklist completion if at least one option is selected
        if (prefix === 'tform1A3') {
            const toggle = document.querySelector(`.toggle-switch[data-item="1A-3"]`);
            if (toggle && !toggle.checked && selectedDomains.length > 0) {
                toggle.checked = true;
                toggle.classList.add('active');
                const statusSpan = document.getElementById('tform-itemStatus-1A-3');
                if (statusSpan) {
                    statusSpan.textContent = 'Done';
                    statusSpan.className = 'toggle-status done';
                }
                tformUpdateMasterToggle(toggle);
                tformUpdateProgress();
            }
            setTimeout(autoSave, 100);
        }
        if (prefix === 'tform3A3') {
            const toggle = document.querySelector(`.toggle-switch[data-item="3A-3"]`);
            if (toggle && !toggle.checked && selectedDomains.length > 0) {
                toggle.checked = true;
                toggle.classList.add('active');
                const statusSpan = document.getElementById('tform-itemStatus-3A-3');
                if (statusSpan) {
                    statusSpan.textContent = 'Done';
                    statusSpan.className = 'toggle-status done';
                }
                tformUpdateMasterToggle(toggle);
                tformUpdateProgress();
            }
            setTimeout(autoSave, 100);
        }
    }

    function removeDomain(domain, prefix = '') {
        const dropdownId = prefix ? `${prefix}DomainDropdown` : 'domainDropdown';
        const checkboxes = document.querySelectorAll(`#${dropdownId} input[type="checkbox"]`);
        checkboxes.forEach(cb => {
            if (cb.value === domain) {
                cb.checked = false;
            }
        });
        updateDomainSelection(prefix);
    }

    function removeDomain(domain) {
        const checkboxes = document.querySelectorAll('#domainDropdown input[type="checkbox"]');
        checkboxes.forEach(cb => {
            if (cb.value === domain) {
                cb.checked = false;
            }
        });
        updateDomainSelection();
    }

    function getSelectedDomains(prefix = '') {
        const dropdownId = prefix ? `${prefix}DomainDropdown` : 'domainDropdown';
        const checkboxes = document.querySelectorAll(`#${dropdownId} input[type="checkbox"]`);
        const selected = [];
        checkboxes.forEach(cb => {
            if (cb.checked) selected.push(cb.value);
        });
        return selected;
    }

    function setSelectedDomains(domains, prefix = '') {
        const dropdownId = prefix ? `${prefix}DomainDropdown` : 'domainDropdown';
        const checkboxes = document.querySelectorAll(`#${dropdownId} input[type="checkbox"]`);
        checkboxes.forEach(cb => {
            cb.checked = domains.includes(cb.value);
        });
        updateDomainSelection(prefix);
    }

    document.addEventListener('click', function(e) {
        const formContainer = document.getElementById('tformDomainMultiSelect');
        if (formContainer && !formContainer.contains(e.target)) {
            const dropdown = document.getElementById('tformDomainDropdown');
            if (dropdown) dropdown.classList.remove('open');
        }

        const container = document.getElementById('domainMultiSelect');
        if (container && !container.contains(e.target)) {
            document.getElementById('domainDropdown').classList.remove('open');
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

    // ===== LOAD DATA =====
    function loadData() {
        try {
            const saved = localStorage.getItem('collegesDataV2');
            if (saved) {
                colleges = JSON.parse(saved);
            } else {
                colleges = {};
            }
        } catch (e) {
            colleges = {};
        }
        loadEmployees();
        renderColleges();
    }

    function saveData() {
        localStorage.setItem('collegesDataV2', JSON.stringify(colleges));
        renderColleges();
    }

    function renderColleges() {
        const grid = document.getElementById('collegeGrid');
        const keys = Object.keys(colleges);
        
        if (keys.length === 0) {
            grid.innerHTML = `
                <div class="empty-state" style="grid-column: 1 / -1;">
                    <i class="fas fa-university"></i>
                    <h3>No Colleges Added Yet</h3>
                    <p style="color:#6b85a0;">Add your first college, then create the first program.</p>
                    <button class="btn btn-primary" style="margin-top:15px;" onclick="openAddCollegeModal()">
                        <i class="fas fa-plus-circle"></i> Add College
                    </button>
                </div>
            `;
            return;
        }

        let html = '';
        keys.forEach(id => {
            const c = colleges[id];
            const programs = Object.values(c.programs || {});
            const programCount = programs.length;
            
            let statusClass = 'no-reports';
            let statusText = 'No Programs';
            if (programCount > 0) {
                statusClass = 'has-reports';
                statusText = '' + programCount + ' Programs';
            }

            let programListHtml = '';
            programs.slice(0, 3).forEach(p => {
                const isComplete = p.isArchived || false;
                programListHtml += `
                    <div class="program-item">
                        <span class="program-name">${p.name || 'Unnamed Program'}</span>
                        <span class="program-status ${isComplete ? 'complete' : 'inprogress'}">
                            ${isComplete ? ' Complete' : ' Active'}
                        </span>
                    </div>
                `;
            });
            if (programs.length > 3) {
                programListHtml += `<div style="font-size:12px; color:#6b85a0; padding:4px 8px;">+ ${programs.length - 3} more programs...</div>`;
            }

            const empCount = employees.filter(emp => !isAdminUserId(emp.id)).length;

            html += `
                <div class="college-card ${currentCollegeId === id ? 'active' : ''}" onclick="openCollege('${id}')">
                    <div class="card-header">
                        <div>
                            <div class="college-name">${c.name || 'Unnamed'}</div>
                        </div>
                        <span class="card-status ${statusClass}">${statusText}</span>
                    </div>
                    <div class="program-list">${programListHtml}</div>
                    <div class="employee-count"><i class="fas fa-users"></i> ${empCount} Employees</div>
                    <div class="card-actions">
                        <button class="btn btn-primary btn-sm" onclick="event.stopPropagation(); openCollege('${id}')">
                            <i class="fas fa-edit"></i> Open
                        </button>
                        <button class="btn btn-info btn-sm" id="newBtn_${id}" onclick="event.stopPropagation(); openCollege('${id}'); setTimeout(openNewProgramModal, 300);">
                            <i class="fas fa-plus"></i> New
                        </button>
                        <button class="btn btn-danger btn-sm" onclick="event.stopPropagation(); deleteCollege('${id}')">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            `;
        });
        grid.innerHTML = html;
    }

    // ===== ADD COLLEGE (Both Roles) =====
    function openAddCollegeModal() {
        document.getElementById('addCollegeModal').classList.add('active');
        document.getElementById('newCollegeName').focus();
    }

    function closeModal() {
        document.getElementById('addCollegeModal').classList.remove('active');
        document.getElementById('newCollegeName').value = '';
    }

    function createCollege() {
        const name = document.getElementById('newCollegeName').value.trim();
        if (!name) {
            alert('Please enter a college name.');
            return;
        }

        const id = 'college_' + Date.now();
        
        colleges[id] = {
            id: id,
            name: name,
            createdAt: new Date().toISOString(),
            programs: {}
        };
        
        saveData();
        closeModal();
        openCollege(id);
        setTimeout(openNewProgramModal, 500);
        alert(' College created! Now add training details for the first program.');
        document.getElementById('btnNewProgram').style.display = currentRole === 'employee' ? 'inline-flex' : 'none';
        document.getElementById('btnNewProgramFooter').style.display = currentRole === 'employee' ? 'inline-flex' : 'none';
    }

    function deleteCollege(id) {
        if (!confirm('Delete "' + (colleges[id]?.name || 'this college') + '" and all its programs?')) return;
        delete colleges[id];
        if (currentCollegeId === id) {
            closeForm();
        }
        saveData();
        // Delete from database
        fetch('/api/delete-college', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ collegeId: id })
        }).catch(err => console.error('Error deleting college from database:', err));
    }

    // ===== NEW PROGRAM (Both Roles) =====
    function openNewProgramModal() {
        if (!currentCollegeId) {
            alert('Please open a college first.');
            return;
        }
        document.getElementById('newProgramModal').classList.add('active');
        document.getElementById('newProgramName').value = 'Program ' + new Date().toLocaleDateString();
        document.getElementById('newProgramSemester').value = '';
        document.getElementById('newProgramStartDate').value = '';
        document.getElementById('newProgramEndDate').value = '';
        document.getElementById('newProgramTotalHours').value = '';
        document.getElementById('newProgramTrainerTrainee').value = '';
        setSelectedDomains([]);
        document.getElementById('newProgramName').focus();
    }

    function closeNewProgramModal() {
        document.getElementById('newProgramModal').classList.remove('active');
    }

    function createNewProgramWithDetails() {
        if (!currentCollegeId) {
            alert('No college selected.');
            return;
        }

        const name = document.getElementById('newProgramName').value.trim();
        const semester = document.getElementById('newProgramSemester').value.trim();
        const domains = getSelectedDomains();
        const startDate = document.getElementById('newProgramStartDate').value;
        const endDate = document.getElementById('newProgramEndDate').value;
        const totalHours = document.getElementById('newProgramTotalHours').value;
        const trainerTrainee = document.getElementById('newProgramTrainerTrainee').value.trim();

        if (!name) {
            alert('Please enter a program name.');
            return;
        }
        if (!semester) {
            alert('Please enter Semester & Batches.');
            return;
        }
        if (domains.length === 0) {
            alert('Please select at least one Training Domain.');
            return;
        }
        if (!startDate) {
            alert('Please select Training Start Date.');
            return;
        }
        if (!endDate) {
            alert('Please select Training End Date.');
            return;
        }
        if (!totalHours) {
            alert('Please enter Total No. of Hours.');
            return;
        }
        if (!trainerTrainee) {
            alert('Please enter No. of Trainers & Trainees.');
            return;
        }

        const college = colleges[currentCollegeId];
        const id = 'prog_' + Date.now();
        
        const formatDate = (dateStr) => {
            if (!dateStr) return '';
            const d = new Date(dateStr);
            return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
        };

        const domainString = domains.join(', ');

        const initialFormData = {
            collegeName: college.name || '',
            semesterBatch: semester,
            trainingDomain: domainString,
            trainingDomainArray: domains,
            trainingDates: formatDate(startDate) + ' to ' + formatDate(endDate),
            totalHours: totalHours,
            trainerTrainee: trainerTrainee,
            rawStartDate: startDate,
            rawEndDate: endDate
        };

        college.programs[id] = {
            id: id,
            name: name,
            createdAt: new Date().toISOString(),
            isArchived: false
        };

        if (currentRole === 'employee' && currentEmployeeId) {
            college.programs[id].formDataByEmployee = {
                [currentEmployeeId]: initialFormData
            };
        } else {
            college.programs[id].formData = initialFormData;
        }
        
        saveData();
        closeNewProgramModal();
        
        openCollege(currentCollegeId);
        const selector = document.getElementById('programSelector');
        selector.value = id;
        switchProgram();
        renderColleges();
        alert(' Program created successfully!');
    }

    // ===== OPEN / CLOSE COLLEGE =====
    function openCollege(id) {
        currentCollegeId = id;
        const college = colleges[id];
        if (!college) return;

        document.getElementById('formContainer').classList.add('active');
        document.getElementById('formCollegeName').textContent = college.name || '---';
        
        const selector = document.getElementById('programSelector');
        selector.innerHTML = '<option value="">-- Select Program --</option>';
        const programs = Object.values(college.programs || {});
        programs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        programs.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = (p.isArchived ? ' ' : ' ') + (p.name || 'Unnamed') + (p.isArchived ? ' (Archived)' : '');
            selector.appendChild(opt);
        });

        const activeProgram = programs.find(p => !p.isArchived);
        if (activeProgram) {
            selector.value = activeProgram.id;
        } else if (programs.length > 0) {
            selector.value = programs[0].id;
        }

        switchProgram();
        renderColleges();
        document.getElementById('formContainer').scrollIntoView({ behavior: 'smooth' });
    }

    function closeForm() {
        currentCollegeId = null;
        currentProgramId = null;
        document.getElementById('formContainer').classList.remove('active');
        renderColleges();
    }

    // ===== PROGRAM SWITCHING =====
    function switchProgram() {
        const selector = document.getElementById('programSelector');
        const programId = selector.value;
        if (!programId) {
            clearForm();
            document.getElementById('formProgramName').textContent = '';
            document.getElementById('programInfo').textContent = 'Status: No program selected';
            currentProgramId = null;
            return;
        }
        
        currentProgramId = programId;
        const college = colleges[currentCollegeId];
        const program = college?.programs?.[programId];
        if (!program) return;

        document.getElementById('formProgramName').textContent = ' - ' + (program.name || 'Unnamed');
        document.getElementById('programInfo').textContent = program.isArchived ? ' Archived - Read Only' : ' Active - In Progress';
        
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

    // ===== LOAD PROGRAM DATA =====
    function loadProgramData(programId) {
        const college = colleges[currentCollegeId];
        const program = college?.programs?.[programId];
        if (!program) return;
        const data = getSavedProgramData(program);

        document.getElementById('tform-collegeName').value = data['collegeName'] || college.name || '';
        document.getElementById('tform-semesterBatch').value = data['semesterBatch'] || '';
        document.getElementById('tform-trainingDates').value = data['trainingDates'] || '';
        document.getElementById('tform-totalHours').value = data['totalHours'] || '';
        document.getElementById('tform-trainerTrainee').value = data['trainerTrainee'] || '';

        const domainDisplay = document.getElementById('tform-domainDisplay');
        const savedDomains = data['trainingDomainArray'] || (data['trainingDomain'] ? data['trainingDomain'].split(',').map(d => d.trim()) : []);
        if (savedDomains.length > 0) {
            domainDisplay.innerHTML = savedDomains.map(d => `<span class="tag">${d}</span>`).join('');
        } else {
            domainDisplay.innerHTML = '<span class="placeholder">No domains selected</span>';
        }
        document.getElementById('tform-trainingDomain').value = data['trainingDomain'] || '';
        if (savedDomains.length > 0) {
            setSelectedDomains(savedDomains, 'tform');
        } else {
            setSelectedDomains([], 'tform');
        }

        document.querySelectorAll('#trainingForm .toggle-switch[data-item]').forEach(t => {
            const key = t.dataset.item;
            const isActive = data[key] === true;
            t.checked = isActive;
            t.classList.toggle('active', isActive);
            const statusSpan = document.getElementById('tform-itemStatus-' + key);
            if (statusSpan) {
                statusSpan.textContent = isActive ? 'Done' : 'Not Done';
                statusSpan.className = 'toggle-status ' + (isActive ? 'done' : 'notdone');
            }
        });

        document.querySelectorAll('#trainingForm .sub-checkbox[data-item]').forEach(el => {
            el.checked = data[el.dataset.item] === true;
        });

        document.querySelectorAll('#trainingForm .toggle-switch[data-target]').forEach(t => {
            const key = 'master_' + t.dataset.target;
            const isActive = data[key] === true;
            t.checked = isActive;
            t.classList.toggle('active', isActive);
            const statusSpan = document.getElementById('tform-masterStatus-' + t.dataset.target);
            if (statusSpan) {
                statusSpan.textContent = isActive ? 'Done' : 'Not Done';
                statusSpan.className = 'master-status ' + (isActive ? 'done' : 'notdone');
            }
        });

        document.querySelectorAll('#trainingForm [data-comment]').forEach(ta => {
            const key = 'comment_' + ta.dataset.comment;
            ta.value = data[key] || '';
        });

        document.querySelectorAll('#trainingForm [data-employee]').forEach(container => {
            const key = 'employee_' + container.dataset.employee;
            const selectedIds = (data[key] || '')
                .split(',')
                .map(id => id.trim())
                .filter(Boolean);

            if (container.classList.contains('employee-checkboxes')) {
                container.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
                    checkbox.checked = selectedIds.includes(checkbox.value);
                });
                container.setAttribute('data-value', selectedIds.join(','));
            } else {
                container.value = data[key] || '';
            }
        });

        // Load signatures - only for admin
        if (currentRole === 'admin') {
            document.getElementById('tform-sig-sai').value = data['sig-sai'] || '';
            document.getElementById('tform-sig-sai-date').value = data['sig-sai-date'] || '';
            document.getElementById('tform-sig-lilly').value = data['sig-lilly'] || '';
            document.getElementById('tform-sig-lilly-date').value = data['sig-lilly-date'] || '';
            document.getElementById('tform-sig-abishith').value = data['sig-abishith'] || '';
            document.getElementById('tform-sig-abishith-date').value = data['sig-abishith-date'] || '';
            checkSignatureStatus();
            restrictAdminSignatures();
        }

        const saved1A3 = data['scope_1A3'] || '';
        setSelectedDomains(saved1A3 ? saved1A3.split(',').map(s => s.trim()) : [], 'tform1A3');

        const saved3A3 = data['scope_3A3'] || '';
        setSelectedDomains(saved3A3 ? saved3A3.split(',').map(s => s.trim()) : [], 'tform3A3');

        tformUpdateProgress();

        const isArchived = program.isArchived || false;
        document.querySelectorAll('#trainingForm input, #trainingForm textarea, #trainingForm select, #trainingForm .toggle-switch').forEach(el => {
            el.disabled = isArchived;
            el.style.opacity = isArchived ? '0.6' : '1';
            el.style.cursor = isArchived ? 'not-allowed' : 'pointer';
        });
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

    // ===== SAVE PROGRAM =====
    function saveCurrentProgram() {
        if (!currentProgramId || !currentCollegeId) {
            alert('No program selected. Save failed.');
            return;
        }
        const college = colleges[currentCollegeId];
        const program = college?.programs?.[currentProgramId];
        // If program is missing under the selected college, handle non-blocking mismatch
        
        if (program.isArchived) {
            alert('Cannot save an archived program.');
            return;
        }

        const data = {};
        data['collegeName'] = document.getElementById('tform-collegeName').value;
        data['semesterBatch'] = document.getElementById('tform-semesterBatch').value;
        data['trainingDomain'] = document.getElementById('tform-trainingDomain').value;
        data['trainingDomainArray'] = data['trainingDomain'] ? data['trainingDomain'].split(',').map(d => d.trim()).filter(Boolean) : [];
        data['trainingDates'] = document.getElementById('tform-trainingDates').value;
        data['totalHours'] = document.getElementById('tform-totalHours').value;
        data['trainerTrainee'] = document.getElementById('tform-trainerTrainee').value;

        document.querySelectorAll('#trainingForm .toggle-switch[data-item]').forEach(t => {
            data[t.dataset.item] = t.checked;
        });

        document.querySelectorAll('#trainingForm .sub-checkbox[data-item]').forEach(el => {
            data[el.dataset.item] = el.checked;
        });

        document.querySelectorAll('#trainingForm .toggle-switch[data-target]').forEach(t => {
            data['master_' + t.dataset.target] = t.checked;
        });

        document.querySelectorAll('#trainingForm [data-comment]').forEach(ta => {
            data['comment_' + ta.dataset.comment] = ta.value;
        });

        document.querySelectorAll('#trainingForm [data-employee]').forEach(container => {
            if (container.classList.contains('employee-checkboxes')) {
                const selected = Array.from(container.querySelectorAll('input[type="checkbox"]:checked'))
                    .map(cb => cb.value)
                    .join(',');
                data['employee_' + container.dataset.employee] = selected;
                container.setAttribute('data-value', selected);
            } else {
                data['employee_' + container.dataset.employee] = container.value;
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
        if (!data['sig-lilly']) unfilled.push("Siljy John Signature");
        if (!data['sig-abishith']) unfilled.push("Client / Coordinator Signature");

        data.unfilledFields = unfilled.length > 0 ? unfilled.join(', ') : 'None';

        // Audit the save to help trace cross-college overwrites
        try {
            const audit = JSON.parse(localStorage.getItem('saveAudit') || '[]');
            audit.push({
                time: new Date().toISOString(),
                collegeId: currentCollegeId,
                programId: currentProgramId,
                role: currentRole,
                employeeId: currentEmployeeId || null
            });
            localStorage.setItem('saveAudit', JSON.stringify(audit));
        } catch (e) {
            console.warn('Audit log write failed', e);
        }

        // If program doesn't exist under current college, try non-blocking banner flow
        if (!program) {
            let found = null;
            for (const cid in colleges) {
                if (colleges[cid].programs && colleges[cid].programs[currentProgramId]) {
                    found = { collegeId: cid, programId: currentProgramId, program: colleges[cid].programs[currentProgramId] };
                    break;
                }
            }
            if (found) {
                // Store pending save context and show banner
                window._pendingSave = { found, data };
                showSaveMismatchBanner(found, data);
                return; // wait for user to act on banner
            } else {
                alert('Program not found in the selected college. Save aborted.');
                return;
            }
        }

        data['scope_1A3'] = getSelectedDomains('tform1A3').join(', ');
        data['scope_3A3'] = getSelectedDomains('tform3A3').join(', ');

        setSavedProgramData(program, data);
        try {
            saveData();
            renderColleges();
            if (currentRole === 'admin') {
                checkSignatureStatus();
            }
        } catch (err) {
            console.error('Save failed:', err);
            alert('Save failed. Please try again.');
        }
    }

    function clearForm() {
        document.querySelectorAll('#trainingForm input, #trainingForm textarea, #trainingForm select').forEach(el => {
            if (el.type !== 'button' && el.type !== 'submit' && !el.dataset.employee) {
                el.value = '';
            }
        });
        document.querySelectorAll('#trainingForm [data-employee]').forEach(container => {
            if (container.classList.contains('employee-checkboxes')) {
                container.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
                    checkbox.checked = false;
                });
                container.setAttribute('data-value', '');
            } else {
                container.value = '';
            }
        });
        document.querySelectorAll('#trainingForm .toggle-switch').forEach(t => {
            t.checked = false;
            t.classList.remove('active');
        });
        document.querySelectorAll('#trainingForm .toggle-status, #trainingForm .master-status').forEach(el => {
            el.textContent = 'Not Done';
            el.className = el.className.includes('master-status') ? 'master-status notdone' : 'toggle-status notdone';
        });
        document.getElementById('tform-domainDisplay').innerHTML = '<span class="placeholder">No domains selected</span>';
        if (currentRole === 'admin') {
            document.querySelectorAll('.sig-status').forEach(el => {
                el.textContent = ' Pending';
                el.className = 'sig-status pending';
            });
            document.getElementById('signatureBanner').textContent = ' PENDING: All 3 signatories must sign and date to complete the report';
            document.getElementById('signatureBanner').className = 'signature-status-banner pending';
        }
        setSelectedDomains([], 'tform1A3');
        setSelectedDomains([], 'tform3A3');
        tformUpdateProgress();
    }

    function markCompleteAndArchive() {
        if (currentRole !== 'admin') {
            alert('Only Admin can archive programs.');
            return;
        }

        if (!currentProgramId || !currentCollegeId) {
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

        const allSigned = checkSignatureStatus();
        if (!allSigned) {
            alert(' Cannot archive: All 3 signatories (Sai Kumar, Lilly John, Abishith Rao) must sign and date the report first.');
            return;
        }

        if (!confirm('Archive "' + program.name + '" as completed? This will lock the form.')) return;

        saveCurrentProgram();
        program.isArchived = true;
        saveData();
        
        openCollege(currentCollegeId);
        renderColleges();
        alert(' Program archived successfully! All signatures are complete.');
    }

    // ===== TOGGLE FUNCTIONS =====
    function tformToggleItem(btn) {
        // Disable for admin (view-only)
        if (currentRole === 'admin') {
            btn.checked = !btn.checked;
            return;
        }
        const isArchived = isProgramArchived();
        if (isArchived) {
            btn.checked = !btn.checked;
            return;
        }
        
        const isActive = btn.checked;
        btn.classList.toggle('active', isActive);
        const itemId = btn.dataset.item;
        const statusSpan = document.getElementById('tform-itemStatus-' + itemId);
        if (statusSpan) {
            statusSpan.textContent = isActive ? 'Done' : 'Not Done';
            statusSpan.className = 'toggle-status ' + (isActive ? 'done' : 'notdone');
        }

        // Automatically toggle child sub-checkboxes if any exist
        const subCbs = document.querySelectorAll(`#trainingForm .sub-checkbox[data-item^="${itemId}-"]`);
        subCbs.forEach(cb => {
            cb.checked = isActive;
        });

        tformUpdateMasterToggle(btn);
        tformUpdateProgress();
        setTimeout(saveCurrentProgram, 300);
    }

    function tformToggleSubItem(btn) {
        // Disable for admin (view-only)
        if (currentRole === 'admin') {
            btn.checked = !btn.checked;
            return;
        }
        const isArchived = isProgramArchived();
        if (isArchived) {
            btn.checked = !btn.checked;
            return;
        }
        
        // Find parent item ID (e.g. from "3H-2-1" get "3H-2")
        const childKey = btn.dataset.item;
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

    function tformToggleMaster(btn) {
        // Disable for admin (view-only)
        if (currentRole === 'admin') {
            btn.checked = !btn.checked;
            return;
        }
        const isArchived = isProgramArchived();
        if (isArchived) {
            btn.checked = !btn.checked;
            return;
        }
        
        const isActive = btn.checked;
        btn.classList.toggle('active', isActive);
        const target = btn.dataset.target;
        const statusSpan = document.getElementById('tform-masterStatus-' + target);
        if (statusSpan) {
            statusSpan.textContent = isActive ? 'Done' : 'Not Done';
            statusSpan.className = 'master-status ' + (isActive ? 'done' : 'notdone');
        }

        const subsection = document.querySelector('#trainingForm .checklist[data-subsection="' + target + '"]');
        if (subsection) {
            subsection.querySelectorAll('.toggle-switch[data-item]').forEach(t => {
                if (!t.dataset.target) {
                    t.checked = isActive;
                    t.classList.toggle('active', isActive);
                    const itemId = t.dataset.item;
                    const itemStatus = document.getElementById('tform-itemStatus-' + itemId);
                    if (itemStatus) {
                        itemStatus.textContent = isActive ? 'Done' : 'Not Done';
                        itemStatus.className = 'toggle-status ' + (isActive ? 'done' : 'notdone');
                    }
                }
            });
        }
        tformUpdateProgress();
        setTimeout(saveCurrentProgram, 300);
    }

    function tformSetAll(subsectionId, state) {
        // Disable for admin (view-only)
        if (currentRole === 'admin') return;
        const isArchived = isProgramArchived();
        if (isArchived) return;
        
        const subsection = document.querySelector('#trainingForm .checklist[data-subsection="' + subsectionId + '"]');
        if (!subsection) return;
        subsection.querySelectorAll('.toggle-switch[data-item]').forEach(t => {
            t.checked = state;
            t.classList.toggle('active', state);
            const itemId = t.dataset.item;
            const statusSpan = document.getElementById('tform-itemStatus-' + itemId);
            if (statusSpan) {
                statusSpan.textContent = state ? 'Done' : 'Not Done';
                statusSpan.className = 'toggle-status ' + (state ? 'done' : 'notdone');
            }
        });
        const masterBtn = document.querySelector('#trainingForm .toggle-switch[data-target="' + subsectionId + '"]');
        if (masterBtn) {
            masterBtn.checked = state;
            masterBtn.classList.toggle('active', state);
            const statusSpan = document.getElementById('tform-masterStatus-' + subsectionId);
            if (statusSpan) {
                statusSpan.textContent = state ? 'Done' : 'Not Done';
                statusSpan.className = 'master-status ' + (state ? 'done' : 'notdone');
            }
        }
        tformUpdateProgress();
        setTimeout(saveCurrentProgram, 300);
    }

    function tformUpdateMasterToggle(btn) {
        const itemId = btn.dataset.item;
        const toggleItem = btn.closest('.toggle-item');
        if (!toggleItem) return;
        const checklist = toggleItem.closest('.checklist');
        if (!checklist) return;
        const subsectionId = checklist.dataset.subsection;
        if (!subsectionId) return;

        const allToggles = checklist.querySelectorAll('.toggle-switch[data-item]');
        let allOn = true;
        allToggles.forEach(t => { if (!t.checked) allOn = false; });

        const masterBtn = document.querySelector('#trainingForm .toggle-switch[data-target="' + subsectionId + '"]');
        if (masterBtn) {
            masterBtn.checked = allOn;
            masterBtn.classList.toggle('active', allOn);
            const masterStatus = document.getElementById('tform-masterStatus-' + subsectionId);
            if (masterStatus) {
                masterStatus.textContent = allOn ? 'Done' : 'Not Done';
                masterStatus.className = 'master-status ' + (allOn ? 'done' : 'notdone');
            }
        }
    }

    function isProgramArchived() {
        if (!currentCollegeId || !currentProgramId) return false;
        const college = colleges[currentCollegeId];
        const program = college?.programs?.[currentProgramId];
        return program?.isArchived || false;
    }

    function tformUpdateProgress() {
        const allToggles = document.querySelectorAll('#trainingForm .toggle-switch[data-item]');
        const total = allToggles.length;
        let active = 0;
        allToggles.forEach(t => { if (t.checked) active++; });

        document.getElementById('tform-totalCount').textContent = total;
        document.getElementById('tform-completedCount').textContent = active;

        const pct = total > 0 ? Math.round((active / total) * 100) : 0;
        document.getElementById('tform-progressFill').style.width = pct + '%';

        document.querySelectorAll('#trainingForm .section[data-section]').forEach(section => {
            const sectionId = section.dataset.section;
            const subSections = section.querySelectorAll('.sub-section[data-subsection]');
            let allComplete = true;
            let hasItems = false;
            subSections.forEach(sub => {
                const toggles = sub.querySelectorAll('.toggle-switch[data-item]');
                if (toggles.length === 0) return;
                hasItems = true;
                let allOn = true;
                toggles.forEach(t => { if (!t.checked) allOn = false; });
                if (!allOn) allComplete = false;
            });
            const statusSpan = document.getElementById('tform-sectionStatus-' + sectionId);
            if (statusSpan) {
                if (!hasItems) {
                    statusSpan.textContent = ' No items';
                    statusSpan.className = 'section-status';
                } else if (allComplete) {
                    statusSpan.textContent = ' Complete';
                    statusSpan.className = 'section-status complete';
                } else {
                    statusSpan.textContent = ' In Progress';
                    statusSpan.className = 'section-status incomplete';
                }
            }
        });

        const allSectionStatuses = document.querySelectorAll('#trainingForm .section-status');
        let completeSections = 0;
        allSectionStatuses.forEach(el => {
            if (el.classList.contains('complete')) completeSections++;
        });
        document.getElementById('tform-sectionCompleteCount').textContent = completeSections;
        document.getElementById('tform-totalSectionCount').textContent = allSectionStatuses.length;
    }

    

    function autoSave() {
        clearTimeout(window._autoSaveTimer);
        window._autoSaveTimer = setTimeout(function() {
            if (currentProgramId && currentCollegeId) {
                saveCurrentProgram();
            }
        }, 500);
    }

    // Export audit log for debugging
    function exportSaveAudit() {
        try {
            const audit = JSON.parse(localStorage.getItem('saveAudit') || '[]');
            const blob = new Blob([JSON.stringify(audit, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'save_audit.json';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (e) {
            alert('Failed to export audit: ' + e.message);
        }
    }

    // ===== MISMATCH BANNER HELPERS =====
    function showSaveMismatchBanner(found, data) {
        const banner = document.getElementById('saveMismatchBanner');
        const msg = document.getElementById('saveMismatchMessage');
        if (!banner || !msg) return;
        msg.textContent = `Warning: Program "${found.program.name || found.programId}" appears to belong to "${colleges[found.collegeId].name}". Do you want to save to that college instead?`;
        banner.style.display = 'flex';

        const proceedBtn = document.getElementById('saveMismatchProceed');
        const cancelBtn = document.getElementById('saveMismatchCancel');

        proceedBtn.onclick = function() {
            saveToFoundCollege();
        };
        cancelBtn.onclick = function() {
            hideSaveMismatchBanner();
        };
    }

    function hideSaveMismatchBanner() {
        const banner = document.getElementById('saveMismatchBanner');
        if (!banner) return;
        banner.style.display = 'none';
        // clear pending context
        window._pendingSave = null;
        const proceedBtn = document.getElementById('saveMismatchProceed');
        const cancelBtn = document.getElementById('saveMismatchCancel');
        if (proceedBtn) proceedBtn.onclick = null;
        if (cancelBtn) cancelBtn.onclick = null;
    }

    function saveToFoundCollege() {
        if (!window._pendingSave) return;
        const found = window._pendingSave.found;
        const data = window._pendingSave.data;
        const programObj = colleges[found.collegeId].programs[found.programId];
        if (!programObj) {
            alert('Target program not found. Save aborted.');
            hideSaveMismatchBanner();
            return;
        }
        setSavedProgramData(programObj, data);
        try {
            saveData();
            hideSaveMismatchBanner();
            alert(' Saved to the program in the correct college: ' + (colleges[found.collegeId].name || found.collegeId));
        } catch (err) {
            console.error('Save failed:', err);
            alert('Save failed. Please try again.');
        }
    }

    // Add event listeners for signature fields
    document.addEventListener('change', function(e) {
        if (e.target.id && e.target.id.startsWith('tform-sig-')) {
            checkSignatureStatus();
            setTimeout(saveCurrentProgram, 300);
        }
    });

    // ===== INIT =====
    // Support direct college view via query params on `college.html`.
    const skipLogin = (typeof window.skipLogin !== 'undefined') && (window.skipLogin === true || window.skipLogin === 'true');

    if (skipLogin) {
        // Bypass login overlay and set default role if provided
        document.getElementById('loginOverlay').style.display = 'none';
        document.getElementById('mainHeader').style.display = 'flex';
        if (window.initialRole) {
            currentRole = window.initialRole;
            if (currentRole === 'employee' && window.initialEmployeeId) {
                currentEmployeeId = window.initialEmployeeId;
            }
        }
    } else {
        // Show login first (default behavior)
        document.getElementById('loginOverlay').style.display = 'flex';
        document.getElementById('mainHeader').style.display = 'none';
    }

    loadEmployees();
    loadData();

    // If an initial college/program was requested, open it now
    if (window.initialCollegeId) {
        // Ensure college exists after loadData
        if (colleges[window.initialCollegeId]) {
            currentCollegeId = window.initialCollegeId;
            openCollege(currentCollegeId);
            if (window.initialProgramId) {
                const selector = document.getElementById('programSelector');
                if (selector) selector.value = window.initialProgramId;
                switchProgram();
            }
        }
    }

    document.addEventListener('change', autoSave);
    document.addEventListener('click', function(e) {
        if (e.target.closest('.toggle-switch')) {
            setTimeout(autoSave, 100);
        }
    });

    // ===== GOOGLE SHEETS OVERLAY SYSTEM (Monolithic) =====
    let monolithicSearchQuery = '';
    let monolithicSelectedCell = null;

    window.openGoogleSheetsOverlay = function() {
        const overlay = document.getElementById('sheetsOverlay');
        if (!overlay) return;
        overlay.style.display = 'flex';
        renderMonolithicSheets();
    };

    window.closeSheetsOverlay = function() {
        const overlay = document.getElementById('sheetsOverlay');
        if (overlay) overlay.style.display = 'none';
        
        // Clean cell selection
        document.getElementById('monolithicFormulaInput').value = '';
        monolithicSelectedCell = null;
    };

    function getMonoColumnLetter(index) {
        let temp = "";
        let letter = "";
        while (index >= 0) {
            temp = index % 26;
            letter = String.fromCharCode(temp + 65) + letter;
            index = Math.floor(index / 26) - 1;
        }
        return letter;
    }

    window.selectMonolithicCell = function(element, coordinate) {
        document.querySelectorAll('#sheetsOverlay .data-cell.selected').forEach(c => {
            c.classList.remove('selected');
        });
        element.classList.add('selected');
        monolithicSelectedCell = element;
        document.getElementById('monolithicFormulaInput').value = element.textContent.trim();
    };

    window.handleMonolithicSearch = function(val) {
        monolithicSearchQuery = val;
        renderMonolithicSheets();
    };

    window.renderMonolithicSheets = function() {
        const tableHeaders = document.getElementById('monoColHeaders');
        const tableBody = document.getElementById('monoTableBody');
        if (!tableHeaders || !tableBody) return;        const headers = [
            "Start Date", "College Name", "Course", "Semester & Batch", 
            "Training Domain", "Training Dates", "Total Hours", 
            "Program Status", "Completed Items", "Pending Items", "Total Checklist Items", "Completion %",
            "Sai Kumar (L&D)", "Lilly John (HR)", "Abishith Rao (Admin)"
        ];

        // Column Letter headers
        tableHeaders.innerHTML = '<th class="corner-cell"></th>';
        headers.forEach((h, index) => {
            tableHeaders.innerHTML += `<th>${getMonoColumnLetter(index)}</th>`;
        });

        // Column Labels row
        let headerRow = `<tr class="header-row"><td class="row-number">1</td>`;
        headers.forEach(h => {
            headerRow += `<td class="data-cell" style="font-weight:bold; background-color:#e2efda; text-align:center;">${h}</td>`;
        });
        headerRow += '</tr>';

        let rowNumber = 2;
        let rowsHtml = '';
        const list = [];

        Object.values(colleges).forEach(college => {
            Object.values(college.programs || {}).forEach(prog => {
                const data = prog.formData || {};
                let itemsCount = 0;
                let completeCount = 0;
                Object.keys(data).forEach(key => {
                    if (/^\d[A-Z]-\d+$/.test(key)) {
                        itemsCount++;
                        if (data[key] === true) completeCount++;
                    }
                });
                const percent = itemsCount ? Math.round((completeCount / itemsCount) * 100) : 0;
                
                const sigSai = data['sig-sai'] ? `${data['sig-sai']} (${data['sig-sai-date'] || ''})` : 'Pending';
                const sigLilly = data['sig-lilly'] ? `${data['sig-lilly']} (${data['sig-lilly-date'] || ''})` : 'Pending';
                const sigAbishith = data['sig-abishith'] ? `${data['sig-abishith']} (${data['sig-abishith-date'] || ''})` : 'Pending';

                // Calculate dynamic status
                let statusText = 'Yet to start';
                let statusClass = 'yet-to-start';
                const allSigDone = !!(data['sig-sai'] && data['sig-lilly'] && data['sig-abishith']);
                
                if (allSigDone) {
                    statusText = 'Completed';
                    statusClass = 'complete';
                } else {
                    let start = null;
                    let end = null;
                    if (data.rawStartDate) {
                        start = new Date(data.rawStartDate);
                    }
                    if (data.rawEndDate) {
                        end = new Date(data.rawEndDate);
                    }
                    if ((!start || isNaN(start.getTime())) && data.trainingDates) {
                        const parts = data.trainingDates.split(' to ');
                        if (parts.length === 2) {
                            start = new Date(parts[0]);
                            end = new Date(parts[1]);
                        }
                    }
                    
                    const today = new Date();
                    today.setHours(0,0,0,0);
                    if (start && !isNaN(start.getTime())) start.setHours(0,0,0,0);
                    if (end && !isNaN(end.getTime())) end.setHours(0,0,0,0);
                    
                    if (end && !isNaN(end.getTime()) && today > end) {
                        statusText = 'Pending';
                        statusClass = 'pending';
                    } else if (start && !isNaN(start.getTime()) && today < start) {
                        statusText = 'Yet to start';
                        statusClass = 'yet-to-start';
                    } else {
                        statusText = 'Ongoing';
                        statusClass = 'ongoing';
                    }
                }

                list.push({
                    timestamp: prog.createdAt ? new Date(prog.createdAt).toLocaleString() : new Date().toLocaleString(),
                    collegeName: college.name || data.collegeName || 'Unknown College',
                    programName: prog.name || 'Unnamed Program',
                    semesterBatch: data.semesterBatch || '',
                    trainingDomain: data.trainingDomain || '',
                    trainingDates: data.trainingDates || '',
                    totalHours: data.totalHours || '',
                    isArchived: prog.isArchived,
                    completeCount: completeCount,
                    pendingCount: itemsCount - completeCount,
                    itemsCount: itemsCount,
                    percent: percent + '%',
                    percentNum: percent,
                    sigSai: sigSai,
                    sigLilly: sigLilly,
                    sigAbishith: sigAbishith,
                    statusText: statusText,
                    statusClass: statusClass
                });
            });
        });

        // Search filtering
        const filtered = list.filter(item => {
            if (!monolithicSearchQuery) return true;
            const q = monolithicSearchQuery.toLowerCase();
            return (
                item.collegeName.toLowerCase().includes(q) ||
                item.programName.toLowerCase().includes(q) ||
                item.semesterBatch.toLowerCase().includes(q) ||
                item.trainingDomain.toLowerCase().includes(q)
            );
        });

        filtered.forEach(item => {
            rowsHtml += `
                <tr>
                    <td class="row-number">${rowNumber}</td>
                    <td class="data-cell" onclick="selectMonolithicCell(this, 'A${rowNumber}')">${item.timestamp}</td>
                    <td class="data-cell" onclick="selectMonolithicCell(this, 'B${rowNumber}')">${item.collegeName}</td>
                    <td class="data-cell" onclick="selectMonolithicCell(this, 'C${rowNumber}')">${item.programName}</td>
                    <td class="data-cell" onclick="selectMonolithicCell(this, 'D${rowNumber}')">${item.semesterBatch}</td>
                    <td class="data-cell" onclick="selectMonolithicCell(this, 'E${rowNumber}')">${item.trainingDomain}</td>
                    <td class="data-cell" onclick="selectMonolithicCell(this, 'F${rowNumber}')">${item.trainingDates}</td>
                    <td class="data-cell" onclick="selectMonolithicCell(this, 'G${rowNumber}')">${item.totalHours}</td>
                    <td class="data-cell" onclick="selectMonolithicCell(this, 'H${rowNumber}')" style="text-align:center;">
                        <span class="status-pill ${item.statusClass}">${item.statusText}</span>
                    </td>
                    <td class="data-cell" onclick="selectMonolithicCell(this, 'I${rowNumber}')" style="text-align:right;">${item.completeCount}</td>
                    <td class="data-cell" onclick="selectMonolithicCell(this, 'J${rowNumber}')" style="text-align:right;">${item.pendingCount}</td>
                    <td class="data-cell" onclick="selectMonolithicCell(this, 'K${rowNumber}')" style="text-align:right;">${item.itemsCount}</td>
                    <td class="data-cell" onclick="selectMonolithicCell(this, 'L${rowNumber}')" style="padding: 4px 8px;">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <div style="flex: 1; height: 8px; background-color: #e8eaed; border-radius: 4px; overflow: hidden; min-width: 50px;">
                                <div style="width: ${item.percentNum}%; height: 100%; background-color: ${item.percentNum >= 80 ? '#137333' : item.percentNum >= 40 ? '#f4b400' : '#ef4444'}; border-radius: 4px;"></div>
                            </div>
                            <span style="font-weight: 500; font-size: 11px; min-width: 32px; text-align: right;">${item.percent}</span>
                        </div>
                    </td>
                    <td class="data-cell" onclick="selectMonolithicCell(this, 'M${rowNumber}')" style="color: ${item.sigSai === 'Pending' ? '#b06000' : '#137333'}">${item.sigSai}</td>
                    <td class="data-cell" onclick="selectMonolithicCell(this, 'N${rowNumber}')" style="color: ${item.sigLilly === 'Pending' ? '#b06000' : '#137333'}">${item.sigLilly}</td>
                    <td class="data-cell" onclick="selectMonolithicCell(this, 'O${rowNumber}')" style="color: ${item.sigAbishith === 'Pending' ? '#b06000' : '#137333'}">${item.sigAbishith}</td>
                </tr>
            `;
            rowNumber++;
        });

        // Add padding rows
        for (let r = rowNumber; r <= rowNumber + 20; r++) {
            rowsHtml += `
                <tr>
                    <td class="row-number">${r}</td>
                    ${headers.map((h, i) => `<td class="data-cell" onclick="selectMonolithicCell(this, '${getMonoColumnLetter(i)}${r}')"></td>`).join('')}
                </tr>
            `;
        }

        tableBody.innerHTML = headerRow + rowsHtml;
    };

    window.exportMonolithicCSV = function() {
        let csvContent = "data:text/csv;charset=utf-8,";
        const headers = [
            "Start Date", "College Name", "Course", "Semester/Batch", 
            "Training Domain", "Training Dates", "Total Hours", 
            "Program Status", "Completed Count", "Pending Count", "Total Count", "Completion %",
            "Sai Kumar Signature", "Lilly John Signature", "Abishith Rao Signature"
        ];
        csvContent += headers.map(h => `"${h}"`).join(",") + "\n";
        
        Object.values(colleges).forEach(college => {
            Object.values(college.programs || {}).forEach(prog => {
                const data = prog.formData || {};
                let itemsCount = 0;
                let completeCount = 0;
                Object.keys(data).forEach(key => {
                    if (/^\d[A-Z]-\d+$/.test(key)) {
                        itemsCount++;
                        if (data[key] === true) completeCount++;
                    }
                });
                const percent = itemsCount ? Math.round((completeCount / itemsCount) * 100) : 0;
                
                // Calculate status
                let statusText = 'Yet to start';
                const allSigDone = !!(data['sig-sai'] && data['sig-lilly'] && data['sig-abishith']);
                if (allSigDone) {
                    statusText = 'Completed';
                } else {
                    let start = null;
                    let end = null;
                    if (data.rawStartDate) {
                        start = new Date(data.rawStartDate);
                    }
                    if (data.rawEndDate) {
                        end = new Date(data.rawEndDate);
                    }
                    if ((!start || isNaN(start.getTime())) && data.trainingDates) {
                        const parts = data.trainingDates.split(' to ');
                        if (parts.length === 2) {
                            start = new Date(parts[0]);
                            end = new Date(parts[1]);
                        }
                    }
                    
                    const today = new Date();
                    today.setHours(0,0,0,0);
                    if (start && !isNaN(start.getTime())) start.setHours(0,0,0,0);
                    if (end && !isNaN(end.getTime())) end.setHours(0,0,0,0);
                    
                    if (end && !isNaN(end.getTime()) && today > end) {
                        statusText = 'Pending';
                    } else if (start && !isNaN(start.getTime()) && today < start) {
                        statusText = 'Yet to start';
                    } else {
                        statusText = 'Ongoing';
                    }
                }

                const row = [
                    prog.createdAt ? new Date(prog.createdAt).toISOString() : new Date().toISOString(),
                    college.name || data.collegeName || 'Unknown',
                    prog.name || 'Unnamed',
                    data.semesterBatch || '',
                    data.trainingDomain || '',
                    data.trainingDates || '',
                    data.totalHours || '',
                    statusText,
                    completeCount,
                    itemsCount - completeCount,
                    itemsCount,
                    percent + '%',
                    data['sig-sai'] || 'Pending',
                    data['sig-lilly'] || 'Pending',
                    data['sig-abishith'] || 'Pending'
                ];
                csvContent += row.map(v => `"${v}"`).join(",") + "\n";
            });
        });

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `ATOM_Monolithic_TMS_export_${Date.now()}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    async function hashPassword(password) {
        const msgUint8 = new TextEncoder().encode(password);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        return hashHex;
    }
