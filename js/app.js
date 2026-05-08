(function() {
    // State Management
    const state = {
        clinics: [],
        currentClinicId: null,
        patients: [],
        professionals: [],
        appointments: [],
        currentDate: new Date(new Date().setHours(0, 0, 0, 0)),
        currentUser: null, // Start logged out
        currentView: 'agenda'
    };

    // DOM Elements - to be populated on init
    let elements = {};

    const migrateOldData = () => {
        const oldPatients = localStorage.getItem('hc_patients');
        if (oldPatients && !localStorage.getItem('hc_clinics')) {
            const defaultClinic = {
                id: 'clinic_' + Date.now(),
                name: 'Minha Clínica',
                address: 'Endereço Padrão'
            };
            const clinics = [defaultClinic];
            localStorage.setItem('hc_clinics', JSON.stringify(clinics));
            
            // Move data
            localStorage.setItem(`hc_${defaultClinic.id}_patients`, oldPatients);
            localStorage.setItem(`hc_${defaultClinic.id}_professionals`, localStorage.getItem('hc_professionals') || '[]');
            localStorage.setItem(`hc_${defaultClinic.id}_appointments`, localStorage.getItem('hc_appointments') || '[]');
            
            // Clear old keys
            localStorage.removeItem('hc_patients');
            localStorage.removeItem('hc_professionals');
            localStorage.removeItem('hc_appointments');
        }
    };

    const renderLoginScreen = () => {
        const loginScreen = document.getElementById('loginScreen');
        const app = document.getElementById('app');
        const profList = document.getElementById('profLoginList');
        const landingPage = document.getElementById('landingPage');
        
        loginScreen.classList.remove('hidden');
        app.classList.add('hidden');
        landingPage.classList.add('hidden');

        // Reset sidebar clinic context
        document.querySelector('.logo span').innerText = 'HoraClinica';
        
        if (!state.currentClinicId && state.clinics.length > 0) {
            // This case only happens if user somehow skips landing but has no clinic in URL
            document.getElementById('loginWelcome').innerText = 'Bem-vindo ao HoraClinica';
            document.getElementById('loginSubtitle').innerText = 'Selecione a clínica para acessar';
            document.getElementById('clinicLogoArea').innerHTML = '<i class="fas fa-clinic-medical" style="font-size: 48px; color: var(--primary);"></i>';
            
            profList.innerHTML = `
                <div class="form-group" style="margin-bottom: 20px;">
                    <select id="clinicSelector" style="width: 100%; padding: 12px; border-radius: 8px; border: 1px solid var(--border); font-family: inherit;">
                        <option value="">Escolha uma clínica...</option>
                        ${state.clinics.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}
                    </select>
                </div>
            `;
            document.getElementById('loginAdmin').disabled = true;
            document.getElementById('loginAdmin').style.opacity = '0.5';

            document.getElementById('clinicSelector').onchange = (e) => {
                const id = e.target.value;
                if (id) {
                    state.currentClinicId = id;
                    document.getElementById('loginAdmin').disabled = false;
                    document.getElementById('loginAdmin').style.opacity = '1';
                    loadData();
                    renderLoginScreen();
                }
            };
            return;
        }

        if (state.currentClinicId) {
            const clinic = state.clinics.find(c => c.id === state.currentClinicId);
            document.getElementById('loginWelcome').innerText = `Bem-vindo à ${clinic.name}`;
            document.getElementById('loginSubtitle').innerText = 'Escolha seu perfil profissional';
            document.getElementById('clinicLogoArea').innerHTML = `<div style="width: 80px; height: 80px; background: var(--primary); border-radius: 20px; display: flex; align-items: center; justify-content: center; margin: 0 auto; color: white; font-size: 32px; font-weight: bold; box-shadow: 0 10px 20px rgba(37, 99, 235, 0.2);">${clinic.name.substring(0, 1).toUpperCase()}</div>`;
            
            profList.innerHTML = '';
            
            state.professionals.forEach(p => {
                const btn = document.createElement('button');
                btn.className = 'prof-login-btn';
                btn.innerHTML = `
                    <div style="width: 32px; height: 32px; background: ${p.color}; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-size: 12px; font-weight: bold;">${p.name.substring(0, 2).toUpperCase()}</div>
                    <span>${p.name}</span>
                `;
                btn.onclick = () => {
                    elements.modalTitle.innerText = `Acesso: ${p.name}`;
                    elements.modalBody.innerHTML = `
                        <form id="profLoginForm">
                            <div class="form-group">
                                <label>Senha de Acesso</label>
                                <input type="password" id="loginPass" required autofocus style="width: 100%; padding: 12px; border-radius: 8px; border: 1px solid var(--border);">
                            </div>
                            <p id="loginError" style="color: #ef4444; font-size: 12px; margin-bottom: 12px;" class="hidden">Senha incorreta!</p>
                            <button type="submit" class="btn-primary" style="width: 100%; justify-content: center; padding: 12px;">Entrar</button>
                        </form>
                    `;
                    elements.modalOverlay.classList.remove('hidden');
                    
                    document.getElementById('profLoginForm').onsubmit = (e) => {
                        e.preventDefault();
                        const pass = document.getElementById('loginPass').value;
                        if (pass === p.password) {
                            state.currentUser = { role: 'professional', name: p.name, id: p.id, specialty: p.specialty };
                            elements.professionalFilter.value = p.id;
                            elements.modalOverlay.classList.add('hidden');
                            finishLogin();
                        } else {
                            document.getElementById('loginError').classList.remove('hidden');
                        }
                    };
                };
                profList.appendChild(btn);
            });

            // Back to landing
            const backBtn = document.createElement('button');
            backBtn.innerHTML = '<i class="fas fa-arrow-left"></i> Voltar';
            backBtn.style = 'background: none; border: none; color: var(--text-muted); font-size: 13px; cursor: pointer; width: 100%; margin-top: 20px; display: flex; align-items: center; justify-content: center; gap: 8px;';
            backBtn.onclick = () => {
                state.currentClinicId = null;
                window.history.pushState({}, '', window.location.pathname); // Clear URL
                renderLandingPage();
            };
            profList.appendChild(backBtn);
        } else {
            renderLandingPage();
        }

        document.getElementById('loginAdmin').onclick = () => {
            if (!state.currentClinicId) return;
            state.currentUser = { role: 'admin', name: 'Administrador' };
            elements.professionalFilter.value = 'all';
            finishLogin();
        };

        document.getElementById('loginSuperAdmin').onclick = () => {
            elements.modalTitle.innerText = 'Acesso Super Admin';
            elements.modalBody.innerHTML = `
                <div style="text-align: center; margin-bottom: 20px;">
                    <i class="fas fa-user-shield" style="font-size: 48px; color: var(--primary); margin-bottom: 16px;"></i>
                    <p style="color: var(--text-muted); font-size: 14px;">Digite a senha mestre para acessar o painel de parceiro.</p>
                </div>
                <form id="superAdminForm">
                    <div class="form-group">
                        <label>Senha Mestre</label>
                        <input type="password" id="superPass" placeholder="••••••••" required autofocus style="width: 100%; padding: 12px; border-radius: 8px; border: 1px solid var(--border);">
                    </div>
                    <p id="superLoginError" style="color: #ef4444; font-size: 12px; margin-bottom: 12px;" class="hidden">Senha mestre incorreta!</p>
                    <button type="submit" class="btn-primary" style="width: 100%; justify-content: center; padding: 12px;">Entrar no Painel</button>
                </form>
            `;
            elements.modalOverlay.classList.remove('hidden');
            
            document.getElementById('superAdminForm').onsubmit = (e) => {
                e.preventDefault();
                const pass = document.getElementById('superPass').value;
                if (pass === 'admin123') {
                    state.currentUser = { role: 'super-admin', name: 'Super Admin' };
                    state.currentClinicId = null;
                    elements.modalOverlay.classList.add('hidden');
                    finishLogin();
                } else {
                    document.getElementById('superLoginError').classList.remove('hidden');
                }
            };
        };
    };

    const renderLandingPage = () => {
        document.getElementById('landingPage').classList.remove('hidden');
        document.getElementById('loginScreen').classList.add('hidden');
        document.getElementById('app').classList.add('hidden');
        
        document.getElementById('startNow').onclick = () => {
            if (state.clinics.length > 0) {
                renderLoginScreen();
            } else {
                alert("Nenhuma clínica cadastrada no sistema. Use o Portal do Parceiro para criar a primeira clínica.");
            }
        };

        document.getElementById('goToSuperAdmin').onclick = () => {
            document.getElementById('loginSuperAdmin').click();
        };
    };

    const finishLogin = () => {
        document.getElementById('loginScreen').classList.add('hidden');
        document.getElementById('landingPage').classList.add('hidden');
        document.getElementById('app').classList.remove('hidden');
        updateUserUI();
        
        if (state.currentUser.role === 'super-admin') {
            switchView('super-admin');
        } else {
            const clinic = state.clinics.find(c => c.id === state.currentClinicId);
            document.querySelector('.logo span').innerText = clinic ? clinic.name : 'HoraClinica';
            populateProfFilter();
            switchView('agenda');
        }
    };

    const populateProfFilter = () => {
        if (!elements.professionalFilter) return;
        elements.professionalFilter.innerHTML = '<option value="all">Todos os Profissionais</option>';
        state.professionals.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.innerText = p.name;
            elements.professionalFilter.appendChild(opt);
        });
    };

    // Load Data
    const loadData = () => {
        try {
            migrateOldData();
            
            state.clinics = JSON.parse(localStorage.getItem('hc_clinics')) || [];
            
            if (state.currentClinicId) {
                const prefix = `hc_${state.currentClinicId}_`;
                state.patients = JSON.parse(localStorage.getItem(prefix + 'patients')) || [];
                state.professionals = JSON.parse(localStorage.getItem(prefix + 'professionals')) || [];
                state.appointments = JSON.parse(localStorage.getItem(prefix + 'appointments')) || [];
            } else {
                state.patients = [];
                state.professionals = [];
                state.appointments = [];
            }
        } catch (e) {
            console.error("Erro ao carregar dados", e);
        }
    };

    const saveData = () => {
        localStorage.setItem('hc_clinics', JSON.stringify(state.clinics));
        
        if (state.currentClinicId) {
            const prefix = `hc_${state.currentClinicId}_`;
            localStorage.setItem(prefix + 'patients', JSON.stringify(state.patients));
            localStorage.setItem(prefix + 'professionals', JSON.stringify(state.professionals));
            localStorage.setItem(prefix + 'appointments', JSON.stringify(state.appointments));
        }
    };

    // Utils
    const formatDate = (date) => {
        return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
    };

    const formatDateISO = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    const addMinutes = (time, mins) => {
        let [h, m] = time.split(':').map(Number);
        m += mins;
        h += Math.floor(m / 60);
        m = m % 60;
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
    };

    // Navigation
    const switchView = (view) => {
        state.currentView = view;
        elements.navLinks.forEach(link => {
            link.classList.toggle('active', link.dataset.view === view);
        });
        renderView();
    };

    // Views
    const renderView = () => {
        if (!elements.viewContent) return;
        elements.viewContent.innerHTML = '';
        
        switch(state.currentView) {
            case 'agenda': renderAgenda(); break;
            case 'pacientes': renderPacientes(); break;
            case 'profissionais': renderProfissionais(); break;
            case 'relatorios': renderRelatorios(); break;
            case 'super-admin': renderSuperAdmin(); break;
        }
    };

    const renderSuperAdmin = () => {
        elements.viewTitle.innerText = 'Painel Super Admin';
        elements.viewContent.innerHTML = `
            <div class="card" style="background: white; padding: 24px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
                <div style="display: flex; justify-content: space-between; margin-bottom: 20px;">
                    <h3>Gestão de Clínicas</h3>
                    <button class="btn-primary" id="newClinicBtn"><i class="fas fa-plus"></i> Nova Clínica</button>
                </div>
                <div style="display: flex; flex-direction: column; gap: 16px;">
                    ${state.clinics.map(c => `
                        <div class="clinic-card">
                            <div class="clinic-info">
                                <h4>${c.name}</h4>
                                <p><i class="fas fa-map-marker-alt"></i> ${c.address || 'Sem endereço'}</p>
                                <p><i class="fas fa-id-badge"></i> ID: ${c.id}</p>
                            </div>
                            <div class="clinic-actions">
                                <button class="btn-secondary copy-link-btn" data-id="${c.id}" title="Copiar Link Único"><i class="fas fa-link"></i></button>
                                <button class="btn-secondary manage-clinic-btn" data-id="${c.id}" title="Gerenciar"><i class="fas fa-sign-in-alt"></i></button>
                                <button class="btn-secondary edit-clinic-btn" data-id="${c.id}" title="Editar"><i class="fas fa-edit"></i></button>
                                <button class="btn-secondary delete-clinic-btn" data-id="${c.id}" title="Excluir" style="color: #ef4444;"><i class="fas fa-trash"></i></button>
                            </div>
                        </div>
                    `).join('')}
                    ${state.clinics.length === 0 ? '<p style="text-align: center; color: var(--text-muted); padding: 20px;">Nenhuma clínica cadastrada.</p>' : ''}
                </div>
            </div>
        `;

        document.querySelectorAll('.copy-link-btn').forEach(btn => {
            btn.onclick = () => {
                const id = btn.dataset.id;
                const url = new URL(window.location.href);
                url.searchParams.set('clinic', id);
                navigator.clipboard.writeText(url.toString()).then(() => {
                    alert('Link único copiado para a área de transferência!');
                });
            };
        });

        document.getElementById('newClinicBtn').onclick = () => {
            elements.modalTitle.innerText = 'Nova Clínica';
            elements.modalBody.innerHTML = `
                <form id="clinicForm">
                    <div class="form-group"><label>Nome da Clínica</label><input type="text" id="cName" required></div>
                    <div class="form-group"><label>Endereço</label><input type="text" id="cAddress" required></div>
                    <button type="submit" class="btn-primary" style="width: 100%; justify-content: center;">Salvar Clínica</button>
                </form>
            `;
            elements.modalOverlay.classList.remove('hidden');
            document.getElementById('clinicForm').onsubmit = (e) => {
                e.preventDefault();
                const newClinic = {
                    id: 'clinic_' + Date.now(),
                    name: document.getElementById('cName').value,
                    address: document.getElementById('cAddress').value
                };
                state.clinics.push(newClinic);
                saveData();
                elements.modalOverlay.classList.add('hidden');
                renderSuperAdmin();
            };
        };

        document.querySelectorAll('.manage-clinic-btn').forEach(btn => {
            btn.onclick = () => {
                state.currentClinicId = btn.dataset.id;
                state.currentUser.role = 'admin'; // Act as admin of this clinic
                loadData();
                finishLogin();
            };
        });

        document.querySelectorAll('.edit-clinic-btn').forEach(btn => {
            btn.onclick = () => {
                const clinic = state.clinics.find(c => c.id === btn.dataset.id);
                elements.modalTitle.innerText = 'Editar Clínica';
                elements.modalBody.innerHTML = `
                    <form id="editClinicForm">
                        <div class="form-group"><label>Nome da Clínica</label><input type="text" id="cName" value="${clinic.name}" required></div>
                        <div class="form-group"><label>Endereço</label><input type="text" id="cAddress" value="${clinic.address}" required></div>
                        <button type="submit" class="btn-primary" style="width: 100%; justify-content: center;">Atualizar Clínica</button>
                    </form>
                `;
                elements.modalOverlay.classList.remove('hidden');
                document.getElementById('editClinicForm').onsubmit = (e) => {
                    e.preventDefault();
                    clinic.name = document.getElementById('cName').value;
                    clinic.address = document.getElementById('cAddress').value;
                    saveData();
                    elements.modalOverlay.classList.add('hidden');
                    renderSuperAdmin();
                };
            };
        });

        document.querySelectorAll('.delete-clinic-btn').forEach(btn => {
            btn.onclick = () => {
                if (confirm('ATENÇÃO: Isso excluirá a clínica e TODOS os seus dados permanentemente. Continuar?')) {
                    const id = btn.dataset.id;
                    state.clinics = state.clinics.filter(c => c.id !== id);
                    // Clear clinic data
                    localStorage.removeItem(`hc_${id}_patients`);
                    localStorage.removeItem(`hc_${id}_professionals`);
                    localStorage.removeItem(`hc_${id}_appointments`);
                    saveData();
                    renderSuperAdmin();
                }
            };
        });
    };

    const renderAgenda = () => {
        elements.viewContent.innerHTML = '';
        elements.viewTitle.innerText = 'Agenda do Dia';
        elements.currentDateDisplay.innerText = formatDate(state.currentDate);
        
        const grid = document.createElement('div');
        grid.className = 'agenda-grid';
        
        const timeCol = document.createElement('div');
        timeCol.className = 'time-column';
        for(let h = 7; h <= 18; h++) {
            const slot = document.createElement('div');
            slot.className = 'time-slot';
            slot.innerText = `${h}:00`;
            timeCol.appendChild(slot);
        }
        grid.appendChild(timeCol);
        
        const profsGrid = document.createElement('div');
        profsGrid.className = 'professionals-grid';
        
        const filterVal = elements.professionalFilter.value;
        let filteredProfs = filterVal === 'all' ? state.professionals : state.professionals.filter(p => p.id === filterVal);

        if (state.currentUser.role === 'professional') {
            filteredProfs = state.professionals.filter(p => p.id === state.currentUser.id);
            elements.professionalFilter.parentElement.classList.add('hidden');
        } else {
            elements.professionalFilter.parentElement.classList.remove('hidden');
        }

        filteredProfs.forEach(prof => {
            const col = document.createElement('div');
            col.className = 'professional-col';
            
            const header = document.createElement('div');
            header.className = 'prof-header';
            header.innerText = prof.name;
            col.appendChild(header);
            
            const container = document.createElement('div');
            container.className = 'appointments-container';
            
            const dayApps = getAppointmentsForDay(state.currentDate, prof.id);
            dayApps.forEach(app => {
                const card = createAppointmentCard(app);
                container.appendChild(card);
            });
            
            col.appendChild(container);
            profsGrid.appendChild(col);
        });
        
        grid.appendChild(profsGrid);
        elements.viewContent.appendChild(grid);
    };

    const getAppointmentsForDay = (date, profId) => {
        const dateStr = formatDateISO(date);
        return state.appointments.filter(app => {
            if (app.professionalId !== profId) return false;
            if (app.date === dateStr) return true;
            if (app.recurring && app.recurringType === 'weekly') {
                const [y, m, d] = app.date.split('-').map(Number);
                const appDate = new Date(y, m - 1, d);
                return date >= appDate && date.getDay() === appDate.getDay();
            }
            return false;
        });
    };

    const createAppointmentCard = (app) => {
        const card = document.createElement('div');
        card.className = `appointment-card ${app.status || ''}`;
        
        const [h, m] = app.time.split(':').map(Number);
        const top = ((h - 7) * 60) + m;
        const height = app.duration || 45;
        
        card.style.top = `${top}px`;
        card.style.height = `${height}px`;
        
        const patient = state.patients.find(p => p.id === app.patientId);
        card.innerHTML = `
            <span class="time">${app.time} - ${addMinutes(app.time, height)}</span>
            <span class="patient">${patient ? patient.name : 'Desconhecido'}</span>
        `;
        
        card.onclick = () => openAppointmentDetails(app);
        return card;
    };

    const openNewAppointmentModal = () => {
        elements.modalTitle.innerText = 'Novo Agendamento';
        elements.modalBody.innerHTML = `
            <form id="appointmentForm">
                <div class="form-group">
                    <label>Paciente</label>
                    <select id="appPatient" required>
                        ${state.patients.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label>Profissional</label>
                    <select id="appProfessional" required>
                        ${state.professionals.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label>Data de Início</label>
                    <input type="date" id="appDate" value="${formatDateISO(state.currentDate)}" required>
                </div>
                <div class="form-group">
                    <label>Horário</label>
                    <input type="time" id="appTime" required>
                </div>
                <div class="form-group">
                    <label>Duração (minutos)</label>
                    <input type="number" id="appDuration" value="45" required>
                </div>
                <div class="form-group">
                    <label>Recorrência</label>
                    <select id="appRecurring">
                        <option value="none">Nenhuma</option>
                        <option value="weekly">Semanal (Indeterminado)</option>
                    </select>
                </div>
                <button type="submit" class="btn-primary" style="width: 100%; justify-content: center;">Salvar Agendamento</button>
            </form>
        `;
        
        elements.modalOverlay.classList.remove('hidden');
        
        document.getElementById('appointmentForm').onsubmit = (e) => {
            e.preventDefault();
            const newApp = {
                id: Date.now().toString(),
                patientId: document.getElementById('appPatient').value,
                professionalId: document.getElementById('appProfessional').value,
                date: document.getElementById('appDate').value,
                time: document.getElementById('appTime').value,
                duration: parseInt(document.getElementById('appDuration').value),
                recurring: document.getElementById('appRecurring').value !== 'none',
                recurringType: document.getElementById('appRecurring').value,
                status: 'scheduled'
            };
            state.appointments.push(newApp);
            saveData();
            elements.modalOverlay.classList.add('hidden');
            renderAgenda();
        };
    };

    const openAppointmentDetails = (app) => {
        const patient = state.patients.find(p => p.id === app.patientId);
        const prof = state.professionals.find(p => p.id === app.professionalId);
        
        elements.modalTitle.innerText = 'Detalhes do Agendamento';
        elements.modalBody.innerHTML = `
            <div class="details">
                <p><strong>Paciente:</strong> ${patient ? patient.name : 'Desconhecido'}</p>
                <p><strong>Profissional:</strong> ${prof ? prof.name : 'Desconhecido'}</p>
                <p><strong>Data:</strong> ${app.date}</p>
                <p><strong>Horário:</strong> ${app.time} (${app.duration} min)</p>
                <p><strong>Status:</strong> ${app.status === 'present' ? 'Presente' : (app.status === 'absent' ? 'Não Compareceu' : 'Agendado')}</p>
                <div class="actions" style="margin-top: 20px; display: flex; flex-wrap: wrap; gap: 10px;">
                    <button id="markPresent" class="btn-primary" style="background-color: #10b981;"><i class="fas fa-check"></i> Marcar Presença</button>
                    <button id="markAbsent" class="btn-primary" style="background-color: #ef4444;"><i class="fas fa-times"></i> Não Compareceu</button>
                    ${state.currentUser.role === 'admin' ? '<button id="deleteApp" class="btn-primary" style="background-color: #64748b; width: 100%;"><i class="fas fa-trash"></i> Excluir Agendamento</button>' : ''}
                </div>
            </div>
        `;
        
        elements.modalOverlay.classList.remove('hidden');
        
        document.getElementById('markPresent').onclick = () => {
            app.status = 'present';
            saveData();
            elements.modalOverlay.classList.add('hidden');
            renderAgenda();
        };

        document.getElementById('markAbsent').onclick = () => {
            app.status = 'absent';
            saveData();
            elements.modalOverlay.classList.add('hidden');
            renderAgenda();
        };
        
        const deleteBtn = document.getElementById('deleteApp');
        if (deleteBtn) {
            deleteBtn.onclick = () => {
                state.appointments = state.appointments.filter(a => a.id !== app.id);
                saveData();
                elements.modalOverlay.classList.add('hidden');
                renderAgenda();
            };
        }
    };

    const renderPacientes = () => {
        elements.viewTitle.innerText = 'Gestão de Pacientes';
        elements.viewContent.innerHTML = `
            <div class="card" style="background: white; padding: 24px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
                <div style="display: flex; justify-content: space-between; margin-bottom: 20px;">
                    <h3>Lista de Pacientes</h3>
                    <button class="btn-primary" id="newPatientBtn"><i class="fas fa-plus"></i> Novo Paciente</button>
                </div>
                <table style="width: 100%; border-collapse: collapse;">
                    <thead><tr style="text-align: left; border-bottom: 1px solid #e2e8f0;"><th style="padding: 12px;">Nome</th><th style="padding: 12px;">Telefone</th><th style="padding: 12px;">Ações</th></tr></thead>
                    <tbody>${state.patients.map(p => `<tr style="border-bottom: 1px solid #f1f5f9;"><td style="padding: 12px;">${p.name}</td><td style="padding: 12px;">${p.phone}</td><td style="padding: 12px;"><button class="edit-btn" data-id="${p.id}" title="Editar" style="background: none; border: none; color: #64748b; cursor: pointer; margin-right: 8px;"><i class="fas fa-edit"></i></button><button class="delete-patient-btn" data-id="${p.id}" title="Excluir" style="background: none; border: none; color: #ef4444; cursor: pointer;"><i class="fas fa-trash"></i></button></td></tr>`).join('')}</tbody>
                </table>
            </div>
        `;
        document.getElementById('newPatientBtn').onclick = () => {
            elements.modalTitle.innerText = 'Novo Paciente';
            elements.modalBody.innerHTML = `
                <form id="patientForm">
                    <div class="form-group"><label>Nome Completo</label><input type="text" id="pName" required></div>
                    <div class="form-group"><label>Telefone</label><input type="text" id="pPhone" required></div>
                    <button type="submit" class="btn-primary" style="width: 100%; justify-content: center;">Salvar Paciente</button>
                </form>
            `;
            elements.modalOverlay.classList.remove('hidden');
            document.getElementById('patientForm').onsubmit = (e) => {
                e.preventDefault();
                state.patients.push({ id: Date.now().toString(), name: document.getElementById('pName').value, phone: document.getElementById('pPhone').value });
                saveData();
                elements.modalOverlay.classList.add('hidden');
                renderPacientes();
            };
        };

        document.querySelectorAll('.edit-btn').forEach(btn => {
            btn.onclick = () => {
                const patient = state.patients.find(p => p.id === btn.dataset.id);
                if (patient) {
                    elements.modalTitle.innerText = 'Editar Paciente';
                    elements.modalBody.innerHTML = `
                        <form id="editPatientForm">
                            <div class="form-group"><label>Nome Completo</label><input type="text" id="pName" value="${patient.name}" required></div>
                            <div class="form-group"><label>Telefone</label><input type="text" id="pPhone" value="${patient.phone}" required></div>
                            <button type="submit" class="btn-primary" style="width: 100%; justify-content: center;">Atualizar Paciente</button>
                        </form>
                    `;
                    elements.modalOverlay.classList.remove('hidden');
                    document.getElementById('editPatientForm').onsubmit = (e) => {
                        e.preventDefault();
                        patient.name = document.getElementById('pName').value;
                        patient.phone = document.getElementById('pPhone').value;
                        saveData();
                        elements.modalOverlay.classList.add('hidden');
                        renderPacientes();
                    };
                }
            };
        });

        document.querySelectorAll('.delete-patient-btn').forEach(btn => {
            btn.onclick = () => {
                if (confirm('Tem certeza que deseja excluir este paciente?')) {
                    state.patients = state.patients.filter(p => p.id !== btn.dataset.id);
                    saveData();
                    renderPacientes();
                }
            };
        });
    };

    const renderProfissionais = () => {
        elements.viewTitle.innerText = 'Gestão de Profissionais';
        elements.viewContent.innerHTML = `
            <div class="card" style="background: white; padding: 24px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
                <div style="display: flex; justify-content: space-between; margin-bottom: 20px;">
                    <h3>Equipe Médica</h3>
                    <button class="btn-primary" id="newProfBtn"><i class="fas fa-plus"></i> Novo Profissional</button>
                </div>
                <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 20px;">
                    ${state.professionals.map(p => `
                        <div style="border: 1px solid #e2e8f0; padding: 16px; border-radius: 8px; text-align: center; position: relative;">
                            <div style="position: absolute; top: 10px; right: 10px; display: flex; gap: 5px;">
                                <button class="edit-prof-btn" data-id="${p.id}" style="background: none; border: none; color: #64748b; cursor: pointer; font-size: 12px;"><i class="fas fa-edit"></i></button>
                                <button class="delete-prof-btn" data-id="${p.id}" style="background: none; border: none; color: #ef4444; cursor: pointer; font-size: 12px;"><i class="fas fa-trash"></i></button>
                            </div>
                            <div style="width: 60px; height: 60px; background: ${p.color}; border-radius: 50%; margin: 10px auto 12px; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 20px;">${p.name.substring(0, 2).toUpperCase()}</div>
                            <h4 style="margin-bottom: 2px;">${p.name}</h4>
                            <p style="font-size: 11px; color: var(--text-muted); margin-bottom: 8px;">${p.specialty || 'Geral'}</p>
                            <button class="login-sim-btn" data-id="${p.id}" style="font-size: 12px; background: #f1f5f9; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; margin-top: 4px;">Acessar Conta</button>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
        document.getElementById('newProfBtn').onclick = () => {
            elements.modalTitle.innerText = 'Novo Profissional';
            elements.modalBody.innerHTML = `
                <form id="profForm">
                    <div class="form-group"><label>Nome</label><input type="text" id="prName" required></div>
                    <div class="form-group"><label>Especialidade</label><input type="text" id="prSpec" required></div>
                    <div class="form-group"><label>Senha de Acesso</label><input type="password" id="prPass" required></div>
                    <button type="submit" class="btn-primary" style="width: 100%; justify-content: center;">Salvar Profissional</button>
                </form>
            `;
            elements.modalOverlay.classList.remove('hidden');
            document.getElementById('profForm').onsubmit = (e) => {
                e.preventDefault();
                state.professionals.push({ 
                    id: Date.now().toString(), 
                    name: document.getElementById('prName').value, 
                    specialty: document.getElementById('prSpec').value, 
                    password: document.getElementById('prPass').value,
                    color: '#'+Math.floor(Math.random()*16777215).toString(16) 
                });
                saveData();
                elements.modalOverlay.classList.add('hidden');
                renderProfissionais();
            };
        };

        document.querySelectorAll('.edit-prof-btn').forEach(btn => {
            btn.onclick = () => {
                const prof = state.professionals.find(p => p.id === btn.dataset.id);
                if (prof) {
                    elements.modalTitle.innerText = 'Editar Profissional';
                    elements.modalBody.innerHTML = `
                        <form id="editProfForm">
                            <div class="form-group"><label>Nome</label><input type="text" id="prName" value="${prof.name}" required></div>
                            <div class="form-group"><label>Especialidade</label><input type="text" id="prSpec" value="${prof.specialty}" required></div>
                            <div class="form-group"><label>Senha de Acesso</label><input type="password" id="prPass" value="${prof.password}" required></div>
                            <button type="submit" class="btn-primary" style="width: 100%; justify-content: center;">Atualizar Profissional</button>
                        </form>
                    `;
                    elements.modalOverlay.classList.remove('hidden');
                    document.getElementById('editProfForm').onsubmit = (e) => {
                        e.preventDefault();
                        prof.name = document.getElementById('prName').value;
                        prof.specialty = document.getElementById('prSpec').value;
                        prof.password = document.getElementById('prPass').value;
                        saveData();
                        elements.modalOverlay.classList.add('hidden');
                        renderProfissionais();
                    };
                }
            };
        });

        document.querySelectorAll('.delete-prof-btn').forEach(btn => {
            btn.onclick = () => {
                if (confirm('Tem certeza que deseja excluir este profissional? Isso também removerá seus agendamentos.')) {
                    state.professionals = state.professionals.filter(p => p.id !== btn.dataset.id);
                    state.appointments = state.appointments.filter(a => a.professionalId !== btn.dataset.id);
                    saveData();
                    renderProfissionais();
                }
            };
        });
    };

    const renderRelatorios = () => {
        elements.viewTitle.innerText = 'Relatórios de Gestão';
        
        const totalApps = state.appointments.length;
        const presentApps = state.appointments.filter(a => a.status === 'present').length;
        const attendanceRate = totalApps > 0 ? Math.round((presentApps / totalApps) * 100) : 0;
        
        const appsPerProf = state.professionals.map(p => {
            const count = state.appointments.filter(a => a.professionalId === p.id).length;
            return { name: p.name, count };
        });

        elements.viewContent.innerHTML = `
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 24px; margin-bottom: 40px;">
                <div class="card" style="background: white; padding: 24px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); text-align: center;">
                    <i class="fas fa-calendar-check" style="font-size: 24px; color: #2563eb; margin-bottom: 12px;"></i>
                    <h3 style="font-size: 28px; margin-bottom: 4px;">${totalApps}</h3>
                    <p style="color: #64748b; font-size: 14px;">Total de Agendamentos</p>
                </div>
                <div class="card" style="background: white; padding: 24px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); text-align: center;">
                    <i class="fas fa-user-check" style="font-size: 24px; color: #10b981; margin-bottom: 12px;"></i>
                    <h3 style="font-size: 28px; margin-bottom: 4px;">${attendanceRate}%</h3>
                    <p style="color: #64748b; font-size: 14px;">Taxa de Presença</p>
                </div>
                <div class="card" style="background: white; padding: 24px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); text-align: center;">
                    <i class="fas fa-users" style="font-size: 24px; color: #06b6d4; margin-bottom: 12px;"></i>
                    <h3 style="font-size: 28px; margin-bottom: 4px;">${state.patients.length}</h3>
                    <p style="color: #64748b; font-size: 14px;">Pacientes Ativos</p>
                </div>
                <div class="card" style="background: white; padding: 24px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); text-align: center;">
                    <i class="fas fa-user-md" style="font-size: 24px; color: #6366f1; margin-bottom: 12px;"></i>
                    <h3 style="font-size: 28px; margin-bottom: 4px;">${state.professionals.length}</h3>
                    <p style="color: #64748b; font-size: 14px;">Profissionais na Equipe</p>
                </div>
            </div>

            <div class="card" style="background: white; padding: 32px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
                <h3 style="margin-bottom: 24px;">Desempenho por Profissional</h3>
                <div style="display: flex; flex-direction: column; gap: 20px;">
                    ${appsPerProf.map(p => {
                        const percent = totalApps > 0 ? (p.count / totalApps) * 100 : 0;
                        return `
                            <div style="width: 100%;">
                                <div style="display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 14px; font-weight: 500;">
                                    <span>${p.name}</span>
                                    <span>${p.count} agendamentos (${Math.round(percent)}%)</span>
                                </div>
                                <div style="width: 100%; height: 12px; background: #f1f5f9; border-radius: 6px; overflow: hidden;">
                                    <div style="width: ${percent}%; height: 100%; background: #2563eb; transition: width 1s ease-in-out;"></div>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    };

    const simulateLoginAs = (profId) => {
        const prof = state.professionals.find(p => p.id === profId);
        state.currentUser = { role: 'professional', name: prof.name, id: prof.id };
        elements.professionalFilter.value = prof.id;
        updateUserUI();
        switchView('agenda');
    };

    const updateUserUI = () => {
        elements.userName.innerText = state.currentUser.name;
        elements.userRole.innerText = state.currentUser.role === 'super-admin' ? 'Super Admin' : (state.currentUser.role === 'admin' ? 'Admin Principal' : (state.currentUser.specialty || 'Profissional'));
        elements.userAvatar.innerText = state.currentUser.name.substring(0, 2).toUpperCase();
        
        // Handle menu visibility
        const isSuperAdmin = state.currentUser.role === 'super-admin';
        
        document.querySelectorAll('.super-admin-only').forEach(el => el.classList.toggle('hidden', !isSuperAdmin));
        document.querySelectorAll('.admin-only').forEach(el => el.classList.toggle('hidden', isSuperAdmin));

        if (state.currentUser.role === 'professional') {
            document.getElementById('app').classList.replace('admin-view', 'professional-view');
        } else {
            document.getElementById('app').classList.replace('professional-view', 'admin-view');
        }
    };

    const init = () => {
        // Map elements
        elements = {
            app: document.getElementById('app'),
            viewContent: document.getElementById('viewContent'),
            viewTitle: document.getElementById('viewTitle'),
            navLinks: document.querySelectorAll('.nav-links li'),
            currentDateDisplay: document.getElementById('currentDateDisplay'),
            prevDay: document.getElementById('prevDay'),
            nextDay: document.getElementById('nextDay'),
            todayBtn: document.getElementById('todayBtn'),
            hiddenDatePicker: document.getElementById('hiddenDatePicker'),
            professionalFilter: document.getElementById('professionalFilter'),
            addAppointmentBtn: document.getElementById('addAppointmentBtn'),
            modalOverlay: document.getElementById('modalOverlay'),
            modalTitle: document.getElementById('modalTitle'),
            modalBody: document.getElementById('modalBody'),
            closeModal: document.querySelector('.close-modal'),
            userName: document.getElementById('userName'),
            userRole: document.getElementById('userRole'),
            userAvatar: document.getElementById('userAvatar'),
            logoutBtn: document.getElementById('logoutBtn')
        };

        loadData();

        // Check for clinic in URL
        const urlParams = new URLSearchParams(window.location.search);
        const urlClinicId = urlParams.get('clinic');
        if (urlClinicId) {
            state.currentClinicId = urlClinicId;
            loadData();
        }

        // Event Listeners
        elements.navLinks.forEach(link => {
            link.onclick = () => switchView(link.dataset.view);
        });

        elements.prevDay.onclick = () => {
            state.currentDate.setDate(state.currentDate.getDate() - 1);
            renderView();
        };

        elements.nextDay.onclick = () => {
            state.currentDate.setDate(state.currentDate.getDate() + 1);
            renderView();
        };

        elements.todayBtn.onclick = () => {
            state.currentDate = new Date(new Date().setHours(0, 0, 0, 0));
            renderView();
        };

        elements.hiddenDatePicker.onchange = (e) => {
            if (e.target.value) {
                // Adjust for timezone offset to ensure the date is correct
                const [y, m, d] = e.target.value.split('-').map(Number);
                state.currentDate = new Date(y, m - 1, d);
                renderView();
            }
        };

        elements.professionalFilter.onchange = () => renderView();
        elements.addAppointmentBtn.onclick = () => openNewAppointmentModal();
        elements.closeModal.onclick = () => elements.modalOverlay.classList.add('hidden');
        elements.logoutBtn.onclick = () => {
            state.currentUser = null;
            state.currentClinicId = null; // Reset clinic on logout
            loadData();
            renderLoginScreen();
        };

        if (!state.currentUser) {
            renderLoginScreen();
        } else {
            document.getElementById('app').classList.remove('hidden');
            updateUserUI();
            populateProfFilter();
            renderView();
        }
    };

    // Run on Load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
