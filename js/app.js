(function() {
    // State Management
    const state = {
        patients: [],
        professionals: [],
        appointments: [],
        currentDate: new Date(),
        currentUser: null, // Start logged out
        currentView: 'agenda'
    };

    // DOM Elements - to be populated on init
    let elements = {};

    const renderLoginScreen = () => {
        const loginScreen = document.getElementById('loginScreen');
        const app = document.getElementById('app');
        const profList = document.getElementById('profLoginList');
        
        loginScreen.classList.remove('hidden');
        app.classList.add('hidden');
        
        profList.innerHTML = '';
        state.professionals.forEach(p => {
            const btn = document.createElement('button');
            btn.className = 'prof-login-btn';
            btn.innerText = p.name;
            btn.onclick = () => {
                elements.modalTitle.innerText = `Acesso: ${p.name}`;
                elements.modalBody.innerHTML = `
                    <form id="profLoginForm">
                        <div class="form-group">
                            <label>Senha de Acesso</label>
                            <input type="password" id="loginPass" required autofocus>
                        </div>
                        <p id="loginError" style="color: #ef4444; font-size: 12px; margin-bottom: 12px;" class="hidden">Senha incorreta!</p>
                        <button type="submit" class="btn-primary" style="width: 100%; justify-content: center;">Entrar</button>
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

        document.getElementById('loginAdmin').onclick = () => {
            state.currentUser = { role: 'admin', name: 'Administrador' };
            elements.professionalFilter.value = 'all';
            finishLogin();
        };
    };

    const finishLogin = () => {
        document.getElementById('loginScreen').classList.add('hidden');
        document.getElementById('app').classList.remove('hidden');
        updateUserUI();
        switchView('agenda');
    };

    // Load Data
    const loadData = () => {
        try {
            state.patients = JSON.parse(localStorage.getItem('hc_patients')) || [
                { id: '1', name: 'Mateus Felipe', phone: '11999999999' },
                { id: '2', name: 'Paulo Atilio', phone: '11888888888' }
            ];
            state.professionals = JSON.parse(localStorage.getItem('hc_professionals')) || [
                { id: '1', name: 'Amanda', specialty: 'Dermatologia', password: '123', color: '#22c55e' },
                { id: '2', name: 'Anik', specialty: 'Pediatria', password: '123', color: '#3b82f6' },
                { id: '3', name: 'Cintia', specialty: 'Ginecologia', password: '123', color: '#06b6d4' },
                { id: '4', name: 'Claudia', specialty: 'Clínica Geral', password: '123', color: '#10b981' }
            ];
            state.appointments = JSON.parse(localStorage.getItem('hc_appointments')) || [
                { id: '101', patientId: '1', professionalId: '1', date: new Date().toISOString().split('T')[0], time: '08:00', duration: 45, status: 'present' },
                { id: '102', patientId: '2', professionalId: '2', date: new Date().toISOString().split('T')[0], time: '09:00', duration: 45, status: 'scheduled' },
                { id: '103', patientId: '1', professionalId: '3', date: new Date().toISOString().split('T')[0], time: '13:00', duration: 60, status: 'scheduled' },
                { id: '104', patientId: '2', professionalId: '4', date: new Date().toISOString().split('T')[0], time: '14:00', duration: 60, status: 'scheduled' },
                { id: '105', patientId: '1', professionalId: '1', date: new Date().toISOString().split('T')[0], time: '16:00', duration: 45, recurring: true, recurringType: 'weekly', status: 'scheduled' }
            ];
        } catch (e) {
            console.error("Erro ao carregar dados", e);
        }
    };

    const saveData = () => {
        localStorage.setItem('hc_patients', JSON.stringify(state.patients));
        localStorage.setItem('hc_professionals', JSON.stringify(state.professionals));
        localStorage.setItem('hc_appointments', JSON.stringify(state.appointments));
    };

    // Utils
    const formatDate = (date) => {
        return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
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
        }
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
        const dateStr = date.toISOString().split('T')[0];
        return state.appointments.filter(app => {
            if (app.professionalId !== profId) return false;
            if (app.date === dateStr) return true;
            if (app.recurring && app.recurringType === 'weekly') {
                const appDate = new Date(app.date);
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
                    <input type="date" id="appDate" value="${state.currentDate.toISOString().split('T')[0]}" required>
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
        elements.userRole.innerText = state.currentUser.role === 'admin' ? 'Admin Principal' : (state.currentUser.specialty || 'Profissional');
        elements.userAvatar.innerText = state.currentUser.name.substring(0, 2).toUpperCase();
        
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

        // Populate filter
        elements.professionalFilter.innerHTML = '<option value="all">Todos os Profissionais</option>';
        state.professionals.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.innerText = p.name;
            elements.professionalFilter.appendChild(opt);
        });

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
            state.currentDate = new Date();
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
            renderLoginScreen();
        };

        if (!state.currentUser) {
            renderLoginScreen();
        } else {
            document.getElementById('app').classList.remove('hidden');
            updateUserUI();
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
