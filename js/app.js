(function () {
    // State Management
    const state = {
        clinics: [],
        currentClinicId: null,
        patients: [],
        professionals: [],
        appointments: [],
        currentDate: new Date(new Date().setHours(0, 0, 0, 0)),
        currentUser: null, // Start logged out
        currentView: 'agenda',
        insurances: [],
        columnWidth: 150,
        agendaSearch: '',
        recentlyDeletedIds: new Set(),
        isFirebaseLoaded: false, // Lista completa de clínicas carregada
        currentClinic: null, // Clínica ativa (link direto ?clinic=)
        isClinicLoginReady: false // Metadados da clínica do link já consultados
    };

    const CLINIC_CACHE_KEY = 'hc_clinic_v1';

    const getClinicCache = (id) => {
        try {
            const cache = JSON.parse(sessionStorage.getItem(CLINIC_CACHE_KEY) || '{}');
            return cache[id] || null;
        } catch {
            return null;
        }
    };

    const setClinicCache = (clinic) => {
        if (!clinic?.id) return;
        try {
            const cache = JSON.parse(sessionStorage.getItem(CLINIC_CACHE_KEY) || '{}');
            cache[clinic.id] = { id: clinic.id, name: clinic.name, adminPass: clinic.adminPass };
            sessionStorage.setItem(CLINIC_CACHE_KEY, JSON.stringify(cache));
        } catch { /* ignore */ }
    };

    const getActiveClinic = () =>
        state.currentClinic || state.clinics.find(c => c.id === state.currentClinicId);

    // DOM Elements - to be populated on init
    let elements = {};
    let unsubscribes = []; // For Firebase listeners

    // Utilitário: debounce para evitar múltiplos renders simultâneos
    const debounce = (fn, delay) => {
        let timer;
        return (...args) => {
            clearTimeout(timer);
            timer = setTimeout(() => fn(...args), delay);
        };
    };

    // Esconde a tela de loading com fade suave
    const hideLoadingScreen = () => {
        const ls = document.getElementById('loadingScreen');
        if (ls && !ls.classList.contains('fade-out')) {
            ls.classList.add('fade-out');
            // Remove do DOM depois da transição para não bloquear interação
            setTimeout(() => { if (ls.parentNode) ls.parentNode.removeChild(ls); }, 450);
        }
    };


    const migrateToFirebase = async () => {
        const localClinics = JSON.parse(localStorage.getItem('hc_clinics'));
        if (localClinics && localClinics.length > 0) {
            console.log("Migrando dados locais para o Firebase...");
            for (const clinic of localClinics) {
                // Save clinic
                await db.collection('clinics').doc(clinic.id).set(clinic);

                // Migrate patients
                const patients = JSON.parse(localStorage.getItem(`hc_${clinic.id}_patients`)) || [];
                for (const p of patients) await db.collection('clinics').doc(clinic.id).collection('patients').doc(p.id).set(p);

                // Migrate professionals
                const professionals = JSON.parse(localStorage.getItem(`hc_${clinic.id}_professionals`)) || [];
                for (const p of professionals) await db.collection('clinics').doc(clinic.id).collection('professionals').doc(p.id).set(p);

                // Migrate appointments
                const appointments = JSON.parse(localStorage.getItem(`hc_${clinic.id}_appointments`)) || [];
                for (const a of appointments) await db.collection('clinics').doc(clinic.id).collection('appointments').doc(a.id).set(a);
            }
            // Clear local storage after migration
            localStorage.clear();
            console.log("Migração concluída com sucesso!");
        }
    };

    const renderLoginScreen = () => {
        // UI estrutural pronta — não manter splash bloqueando a tela inteira
        hideLoadingScreen();

        // Recover clinic from URL if state is lost
        if (!state.currentClinicId) {
            const urlParams = new URLSearchParams(window.location.search || window.location.hash.substring(window.location.hash.indexOf('?')));
            state.currentClinicId = urlParams.get('clinic');
        }

        const loginScreen = document.getElementById('loginScreen');
        const app = document.getElementById('app');
        const profList = document.getElementById('profLoginList');
        const landingPage = document.getElementById('landingPage');

        loginScreen.classList.remove('hidden');
        app.classList.add('hidden');
        landingPage.classList.add('hidden');

        // Reset sidebar clinic context
        document.querySelector('.logo span').innerText = 'HoraClinica';

        // PRIORITY 1: Clinic ID is present (from URL or previous selection)
        if (state.currentClinicId) {
            const clinic = getActiveClinic();

            if (clinic) {
                document.getElementById('loginWelcome').innerText = `Bem-vindo à ${clinic.name}`;
                document.getElementById('loginSubtitle').innerText = 'Escolha seu perfil profissional';
                document.getElementById('clinicLogoArea').innerHTML = `<div style="width: 80px; height: 80px; background: var(--primary); border-radius: 20px; display: flex; align-items: center; justify-content: center; margin: 0 auto; color: white; font-size: 32px; font-weight: bold; box-shadow: 0 10px 20px rgba(37, 99, 235, 0.2);">${clinic.name.substring(0, 1).toUpperCase()}</div>`;

                renderProfessionalList(profList);
            } else if (!state.isClinicLoginReady) {
                document.getElementById('loginWelcome').innerText = 'Carregando clínica...';
                document.getElementById('loginSubtitle').innerText = 'Aguarde um momento.';
                document.getElementById('clinicLogoArea').innerHTML = `
                    <div class="login-card-loading">
                        <div class="loading-spinner"></div>
                    </div>`;
                profList.innerHTML = '';
                document.getElementById('loginAdmin').classList.add('hidden');
            } else {
                document.getElementById('loginWelcome').innerText = 'Clínica não encontrada';
                document.getElementById('loginSubtitle').innerText = 'O link acessado é inválido ou a clínica foi removida.';
                document.getElementById('clinicLogoArea').innerHTML = '<i class="fas fa-exclamation-circle" style="font-size: 48px; color: #ef4444;"></i>';
                profList.innerHTML = `<button onclick="window.location.href='index.html'" class="btn-secondary" style="width: 100%; justify-content: center; margin-top: 20px;">Voltar para o Início</button>`;
                document.getElementById('loginAdmin').classList.add('hidden');
            }
        }
        // PRIORITY 2: No clinic ID but clinics exist
        else if (state.clinics.length > 0) {
            document.getElementById('loginWelcome').innerText = 'Bem-vindo ao HoraClinica';
            document.getElementById('loginSubtitle').innerText = 'Selecione a clínica para acessar';
            document.getElementById('clinicLogoArea').innerHTML = '<i class="fas fa-clinic-medical" style="font-size: 48px; color: var(--primary);"></i>';
            renderClinicSelector(profList);
        }
        // DEFAULT: Show Landing Page
        else {
            renderLandingPage();
        }

        // Always attach Super Admin listener
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
                if (pass === 'admin*123') {
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

    const renderProfessionalList = (container) => {
        container.innerHTML = '';
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
            container.appendChild(btn);
        });

        const backBtn = document.createElement('button');
        backBtn.innerHTML = '<i class="fas fa-arrow-left"></i> Voltar para Início';
        backBtn.style = 'background: none; border: none; color: var(--text-muted); font-size: 13px; cursor: pointer; width: 100%; margin-top: 20px; display: flex; align-items: center; justify-content: center; gap: 8px;';
        backBtn.onclick = () => {
            state.currentClinicId = null;
            // Clear clinic from URL
            const url = new URL(window.location.href);
            url.searchParams.delete('clinic');
            window.history.pushState({}, '', url.toString());

            renderLandingPage();
        };
        container.appendChild(backBtn);

        document.getElementById('loginAdmin').classList.remove('hidden');
        document.getElementById('loginAdmin').disabled = false;
        document.getElementById('loginAdmin').style.opacity = '1';
        updateAdminLoginHandler();
    };

    const renderClinicSelector = (container) => {
        container.innerHTML = `
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
                state.currentClinic = getClinicCache(id);
                const url = new URL(window.location.href);
                url.searchParams.set('clinic', id);
                window.history.pushState({}, '', url.toString());

                setupListeners();
                renderLoginScreen();
            }
        };
    };

    const updateAdminLoginHandler = () => {
        document.getElementById('loginAdmin').onclick = () => {
            if (!state.currentClinicId) return;
            const clinic = getActiveClinic();
            if (!clinic) return;
            elements.modalTitle.innerText = 'Acesso Administrativo';
            elements.modalBody.innerHTML = `
                <div style="text-align: center; margin-bottom: 20px;">
                    <i class="fas fa-lock" style="font-size: 48px; color: var(--primary); margin-bottom: 16px;"></i>
                    <p style="color: var(--text-muted); font-size: 14px;">Acesso restrito ao administrador de <strong>${clinic.name}</strong>.</p>
                </div>
                <form id="clinicAdminLoginForm">
                    <div class="form-group">
                        <label>Senha Administrativa</label>
                        <input type="password" id="clinicAdminPass" placeholder="••••••••" required autofocus style="width: 100%; padding: 12px; border-radius: 8px; border: 1px solid var(--border);">
                    </div>
                    <p id="clinicAdminLoginError" style="color: #ef4444; font-size: 12px; margin-bottom: 12px;" class="hidden">Senha administrativa incorreta!</p>
                    <button type="submit" class="btn-primary" style="width: 100%; justify-content: center; padding: 12px;">Entrar na Clínica</button>
                </form>
            `;
            elements.modalOverlay.classList.remove('hidden');
            document.getElementById('clinicAdminLoginForm').onsubmit = (e) => {
                e.preventDefault();
                const pass = document.getElementById('clinicAdminPass').value;
                if (pass === (clinic.adminPass || '123')) {
                    state.currentUser = { role: 'admin', name: 'Administrador' };
                    elements.professionalFilter.value = 'all';
                    elements.modalOverlay.classList.add('hidden');
                    finishLogin();
                } else {
                    document.getElementById('clinicAdminLoginError').classList.remove('hidden');
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
            setupListeners(); // pacientes, agenda etc. só após login
            const clinic = getActiveClinic();
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

    // renderView com debounce para evitar múltiplos re-renders simultâneos
    // dos listeners Firebase (patients, professionals, appointments disparam juntos)
    const renderViewDebounced = debounce(() => renderView(), 60);

    const upsertClinicInState = (clinic) => {
        if (!clinic?.id) return;
        state.currentClinic = clinic;
        const idx = state.clinics.findIndex(c => c.id === clinic.id);
        if (idx >= 0) state.clinics[idx] = clinic;
        else state.clinics.push(clinic);
        setClinicCache(clinic);
    };

    const onClinicsListSnapshot = (snapshot) => {
        state.clinics = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
        state.isFirebaseLoaded = true;
        hideLoadingScreen();

        if (state.currentUser?.role === 'super-admin') {
            renderSuperAdmin();
        }

        if (!state.currentUser) {
            const landingVisible = !document.getElementById('landingPage').classList.contains('hidden');
            if (state.currentClinicId || !landingVisible) {
                renderLoginScreen();
            }
        }
    };

    const setupClinicsListListener = () => {
        state.isFirebaseLoaded = false;
        const unsub = db.collection('clinics').onSnapshot(onClinicsListSnapshot);
        unsubscribes.push(unsub);
    };

    const applyClinicDoc = (doc) => {
        state.isClinicLoginReady = true;
        if (doc && doc.exists) {
            upsertClinicInState({ ...doc.data(), id: doc.id });
        } else {
            state.currentClinic = null;
        }
        if (!state.currentUser) renderLoginScreen();
    };

    // Login por link: só 1 documento de clínica + profissionais (sem pacientes/agenda)
    const setupClinicLoginListeners = (clinicId) => {
        state.isClinicLoginReady = false;
        const clinicRef = db.collection('clinics').doc(clinicId);

        clinicRef.get().then(applyClinicDoc).catch(err => {
            console.error('Erro ao carregar clínica:', err);
            state.isClinicLoginReady = true;
            if (!state.currentUser) renderLoginScreen();
        });

        const unsubClinic = clinicRef.onSnapshot(doc => applyClinicDoc(doc), err => {
            console.error('Erro ao escutar clínica:', err);
            state.isClinicLoginReady = true;
            if (!state.currentUser) renderLoginScreen();
        });
        unsubscribes.push(unsubClinic);

        const unsubProfs = clinicRef.collection('professionals').onSnapshot(snapshot => {
            state.professionals = snapshot.docs.map(d => ({ ...d.data(), id: d.id }));
            if (!state.currentUser) renderLoginScreen();
        });
        unsubscribes.push(unsubProfs);
    };

    // Após login: coleções completas da clínica
    const setupClinicAppListeners = (clinicId) => {
        const clinicRef = db.collection('clinics').doc(clinicId);

        if (!state.currentClinic) {
            const unsubClinic = clinicRef.onSnapshot(doc => {
                if (doc.exists) upsertClinicInState({ ...doc.data(), id: doc.id });
            });
            unsubscribes.push(unsubClinic);
        }

        const unsubPatients = clinicRef.collection('patients').onSnapshot(snapshot => {
            state.patients = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
            if (state.currentUser) renderViewDebounced();
        });
        unsubscribes.push(unsubPatients);

        const unsubProfs = clinicRef.collection('professionals').onSnapshot(snapshot => {
            state.professionals = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
            if (state.currentUser) {
                populateProfFilter();
                renderViewDebounced();
            }
        });
        unsubscribes.push(unsubProfs);

        const unsubApps = clinicRef.collection('appointments').onSnapshot(snapshot => {
            const loadedApps = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
            state.appointments = loadedApps.filter(app => {
                const appNormId = app.id != null ? String(app.id).trim() : '';
                return !state.recentlyDeletedIds.has(appNormId);
            });
            if (state.currentUser) renderViewDebounced();
        });
        unsubscribes.push(unsubApps);

        const unsubInsurances = clinicRef.collection('insurances').onSnapshot(snapshot => {
            state.insurances = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
            if (state.currentUser && state.currentView === 'pacientes') renderPacientes();
        });
        unsubscribes.push(unsubInsurances);
    };

    const setupListeners = () => {
        unsubscribes.forEach(unsub => unsub());
        unsubscribes = [];
        state.recentlyDeletedIds.clear();

        const isSuperAdmin = state.currentUser?.role === 'super-admin';
        const needsClinicList = isSuperAdmin || !state.currentClinicId;

        if (needsClinicList) {
            setupClinicsListListener();
        }

        if (state.currentClinicId) {
            if (state.currentUser && !isSuperAdmin) {
                setupClinicAppListeners(state.currentClinicId);
            } else if (!state.currentUser) {
                setupClinicLoginListeners(state.currentClinicId);
            }
        }
    };

    const saveData = async (collection, data) => {
        if (!state.currentClinicId && collection !== 'clinics') return;

        try {
            if (collection === 'clinics') {
                await db.collection('clinics').doc(data.id).set(data);
            } else {
                await db.collection('clinics').doc(state.currentClinicId).collection(collection).doc(data.id).set(data);
            }
        } catch (e) {
            console.error("Erro ao salvar no Firebase", e);
            alert("Erro ao salvar dados na nuvem.");
        }
    };

    const deleteData = async (collection, id) => {
        if (!state.currentClinicId && collection !== 'clinics') return;

        try {
            if (collection === 'clinics') {
                await db.collection('clinics').doc(id).delete();
            } else {
                await db.collection('clinics').doc(state.currentClinicId).collection(collection).doc(id).delete();
            }
        } catch (e) {
            console.error("Erro ao excluir no Firebase", e);
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

    const cleanPhone = (phone) => {
        return phone ? phone.replace(/\D/g, '') : '';
    };

    const initSearchableSelect = (containerEl, options, defaultValue, onSelect) => {
        const hiddenInput = containerEl.querySelector('.searchable-select-hidden');
        const searchInput = containerEl.querySelector('.searchable-select-input');
        const dropdown = containerEl.querySelector('.searchable-select-dropdown');
        const optionsContainer = containerEl.querySelector('.searchable-select-options');
        const icon = containerEl.querySelector('.searchable-select-icon');

        let selectedId = defaultValue || '';
        let activeIndex = -1;
        let filteredOptions = [...options];

        // Normalização de strings sem acento para busca inteligente
        const normalizeStr = (str) => {
            return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
        };

        const renderOptions = () => {
            optionsContainer.innerHTML = '';
            if (filteredOptions.length === 0) {
                optionsContainer.innerHTML = `<div class="searchable-select-no-results">Nenhum paciente encontrado</div>`;
                return;
            }

            filteredOptions.forEach((opt, idx) => {
                const optEl = document.createElement('div');
                optEl.className = 'searchable-select-option';
                if (opt.id === selectedId) optEl.classList.add('selected');
                if (idx === activeIndex) optEl.classList.add('active');
                optEl.innerText = opt.name;
                optEl.dataset.id = opt.id;

                optEl.onclick = (e) => {
                    e.stopPropagation();
                    selectOption(opt);
                };
                optionsContainer.appendChild(optEl);
            });
        };

        const filter = (term) => {
            const normTerm = normalizeStr(term);
            filteredOptions = options.filter(opt => normalizeStr(opt.name).includes(normTerm));
            activeIndex = -1;
            renderOptions();
        };

        const selectOption = (opt) => {
            selectedId = opt.id;
            hiddenInput.value = opt.id;
            searchInput.value = opt.name;
            closeDropdown();
            if (onSelect) onSelect(opt.id);
        };

        const openDropdown = () => {
            dropdown.classList.remove('hidden');
            if (icon) icon.style.transform = 'translateY(-50%) rotate(180deg)';
            filter(searchInput.value);
            
            // Centralizar no selecionado
            const selectedEl = optionsContainer.querySelector('.selected');
            if (selectedEl) {
                selectedEl.scrollIntoView({ block: 'nearest' });
            }
        };

        const closeDropdown = () => {
            dropdown.classList.add('hidden');
            if (icon) icon.style.transform = 'translateY(-50%) rotate(0deg)';
            
            // Se o texto não bater exatamente com um paciente, restaura o selecionado
            const currentOpt = options.find(o => o.id === selectedId);
            if (currentOpt) {
                searchInput.value = currentOpt.name;
            } else {
                searchInput.value = '';
            }
        };

        searchInput.onfocus = () => {
            openDropdown();
        };

        searchInput.oninput = (e) => {
            filter(e.target.value);
            if (dropdown.classList.contains('hidden')) {
                openDropdown();
            }
        };

        // Fechar ao clicar fora
        const handleOutsideClick = (e) => {
            if (!containerEl.contains(e.target)) {
                closeDropdown();
            }
        };
        document.addEventListener('click', handleOutsideClick);

        // Teclado
        searchInput.onkeydown = (e) => {
            if (dropdown.classList.contains('hidden')) {
                if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter') {
                    openDropdown();
                    e.preventDefault();
                }
                return;
            }

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                activeIndex = (activeIndex + 1) % filteredOptions.length;
                renderOptions();
                scrollToActive();
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                activeIndex = (activeIndex - 1 + filteredOptions.length) % filteredOptions.length;
                renderOptions();
                scrollToActive();
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (activeIndex >= 0 && activeIndex < filteredOptions.length) {
                    selectOption(filteredOptions[activeIndex]);
                } else if (filteredOptions.length > 0) {
                    selectOption(filteredOptions[0]);
                }
            } else if (e.key === 'Escape') {
                e.preventDefault();
                closeDropdown();
                searchInput.blur();
            }
        };

        const scrollToActive = () => {
            const activeEl = optionsContainer.querySelector('.searchable-select-option.active');
            if (activeEl) {
                activeEl.scrollIntoView({ block: 'nearest' });
            }
        };

        // Limpeza do listener para evitar memory leak
        const interval = setInterval(() => {
            if (!document.body.contains(containerEl)) {
                document.removeEventListener('click', handleOutsideClick);
                clearInterval(interval);
            }
        }, 10000);

        // Definir valor inicial se houver
        const initialOpt = options.find(o => o.id === selectedId);
        if (initialOpt) {
            searchInput.value = initialOpt.name;
            hiddenInput.value = initialOpt.id;
        }

        renderOptions();
    };

    // Navigation
    const switchView = (view) => {
        state.currentView = view;
        elements.navLinks.forEach(link => {
            link.classList.toggle('active', link.dataset.view === view);
        });
        if (elements.app) {
            elements.app.classList.remove('sidebar-open');
        }
        renderView();
    };

    // Views
    const renderView = () => {
        if (!elements.viewContent) return;
        elements.viewContent.innerHTML = '';

        switch (state.currentView) {
            case 'agenda':
                if (elements.agendaSearchContainer) elements.agendaSearchContainer.classList.remove('hidden');
                renderAgenda();
                break;
            case 'pacientes':
                if (elements.agendaSearchContainer) elements.agendaSearchContainer.classList.add('hidden');
                renderPacientes();
                break;
            case 'profissionais':
                if (elements.agendaSearchContainer) elements.agendaSearchContainer.classList.add('hidden');
                renderProfissionais();
                break;
            case 'relatorios':
                if (elements.agendaSearchContainer) elements.agendaSearchContainer.classList.add('hidden');
                renderRelatorios();
                break;
            case 'super-admin':
                if (elements.agendaSearchContainer) elements.agendaSearchContainer.classList.add('hidden');
                renderSuperAdmin();
                break;
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
                                <p><i class="fas fa-envelope"></i> ${c.email || 'Sem e-mail'}</p>
                                <p><i class="fas fa-phone"></i> ${c.phone || 'Sem telefone'}</p>
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
                    <div class="form-group"><label>E-mail de Contato</label><input type="email" id="cEmail" required></div>
                    <div class="form-group"><label>Telefone de Contato</label><input type="text" id="cPhone" required></div>
                    <div class="form-group"><label>Senha do Admin da Clínica</label><input type="password" id="cAdminPass" required></div>
                    <button type="submit" class="btn-primary" style="width: 100%; justify-content: center;">Salvar Clínica</button>
                </form>
            `;
            elements.modalOverlay.classList.remove('hidden');
            document.getElementById('clinicForm').onsubmit = async (e) => {
                e.preventDefault();
                const newClinic = {
                    id: 'clinic_' + Date.now(),
                    name: document.getElementById('cName').value,
                    email: document.getElementById('cEmail').value,
                    phone: document.getElementById('cPhone').value,
                    adminPass: document.getElementById('cAdminPass').value
                };
                await saveData('clinics', newClinic);
                elements.modalOverlay.classList.add('hidden');
            };
        };

        document.querySelectorAll('.manage-clinic-btn').forEach(btn => {
            btn.onclick = () => {
                state.currentClinicId = btn.dataset.id;
                state.currentUser.role = 'admin'; // Act as admin of this clinic
                setupListeners();
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
                        <div class="form-group"><label>E-mail de Contato</label><input type="email" id="cEmail" value="${clinic.email || ''}" required></div>
                        <div class="form-group"><label>Telefone de Contato</label><input type="text" id="cPhone" value="${clinic.phone || ''}" required></div>
                        <div class="form-group"><label>Senha do Admin da Clínica</label><input type="password" id="cAdminPass" value="${clinic.adminPass || ''}" required></div>
                        <button type="submit" class="btn-primary" style="width: 100%; justify-content: center;">Atualizar Clínica</button>
                    </form>
                `;
                elements.modalOverlay.classList.remove('hidden');
                document.getElementById('editClinicForm').onsubmit = async (e) => {
                    e.preventDefault();
                    clinic.name = document.getElementById('cName').value;
                    clinic.email = document.getElementById('cEmail').value;
                    clinic.phone = document.getElementById('cPhone').value;
                    clinic.adminPass = document.getElementById('cAdminPass').value;
                    await saveData('clinics', clinic);
                    elements.modalOverlay.classList.add('hidden');
                };
            };
        });

        document.querySelectorAll('.delete-clinic-btn').forEach(btn => {
            btn.onclick = () => {
                if (confirm('ATENÇÃO: Isso excluirá a clínica e TODOS os seus dados permanentemente. Continuar?')) {
                    deleteData('clinics', btn.dataset.id);
                }
            };
        });
    };

    const renderAgenda = () => {
        elements.viewContent.innerHTML = '';

        // Sync hidden date picker value
        if (elements.hiddenDatePicker) {
            elements.hiddenDatePicker.value = formatDateISO(state.currentDate);
        }

        const grid = document.createElement('div');
        grid.className = 'agenda-grid';

        const timeCol = document.createElement('div');
        timeCol.className = 'time-column';
        for (let h = 7; h <= 18; h++) {
            const slot = document.createElement('div');
            slot.className = 'time-slot';
            slot.innerText = `${h}:00`;
            timeCol.appendChild(slot);
        }
        grid.appendChild(timeCol);

        const profsGrid = document.createElement('div');
        profsGrid.className = 'professionals-grid';

        const filterVal = elements.professionalFilter.value;
        let isSingleProfessional = false;
        let singleProfessional = null;

        if (state.currentUser.role === 'professional') {
            isSingleProfessional = true;
            singleProfessional = state.professionals.find(p => String(p.id) === String(state.currentUser.id));
            elements.professionalFilter.parentElement.classList.add('hidden');
        } else {
            elements.professionalFilter.parentElement.classList.remove('hidden');
            if (filterVal !== 'all') {
                isSingleProfessional = true;
                singleProfessional = state.professionals.find(p => String(p.id) === String(filterVal));
            }
        }

        if (isSingleProfessional && singleProfessional) {
            elements.viewTitle.innerText = `Agenda da Semana - ${singleProfessional.name}`;

            const startOfWeek = new Date(state.currentDate);
            const day = startOfWeek.getDay();
            startOfWeek.setDate(startOfWeek.getDate() - day);

            const endOfWeek = new Date(startOfWeek);
            endOfWeek.setDate(startOfWeek.getDate() + 6);
            elements.currentDateDisplay.innerText = `${startOfWeek.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} até ${endOfWeek.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`;

            const dayNames = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

            for (let i = 0; i < 7; i++) {
                const currentDay = new Date(startOfWeek);
                currentDay.setDate(startOfWeek.getDate() + i);

                const col = document.createElement('div');
                col.className = 'professional-col';

                const header = document.createElement('div');
                header.className = 'prof-header';
                header.style.flexDirection = 'column';
                header.style.lineHeight = '1.2';
                header.innerHTML = `<div>${dayNames[currentDay.getDay()]}</div><div style="font-size: 12px; color: var(--text-muted); font-weight: normal;">${currentDay.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</div>`;
                col.appendChild(header);

                const container = document.createElement('div');
                container.className = 'appointments-container';

                const dayApps = getAppointmentsForDay(currentDay, singleProfessional.id);
                dayApps.forEach(app => {
                    const card = createAppointmentCard(app);
                    container.appendChild(card);
                });

                col.appendChild(container);
                profsGrid.appendChild(col);
            }
        } else {
            elements.viewTitle.innerText = 'Agenda do Dia';
            elements.currentDateDisplay.innerText = formatDate(state.currentDate);

            state.professionals.forEach(prof => {
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
        }

        grid.appendChild(profsGrid);
        elements.viewContent.appendChild(grid);
    };

    const getAppointmentsForDay = (date, profId) => {
        const dateStr = formatDateISO(date);
        return state.appointments.filter(app => {
            if (app.professionalId != profId) return false;

            // Search filter
            if (state.agendaSearch) {
                const patient = state.patients.find(p => p.id == app.patientId);
                if (!patient || !patient.name.toLowerCase().includes(state.agendaSearch.toLowerCase())) {
                    return false;
                }
            }

            if (app.date === dateStr) return true;

            if (app.recurring && app.recurringType === 'weekly') {
                const groupId = app.recurringGroupId ? String(app.recurringGroupId).trim() : '';
                const groupCount = state.appointments.filter(a => a.recurringGroupId && String(a.recurringGroupId).trim() === groupId).length;
                // If the recurring series already has one document per occurrence, do not "project" additional dates.
                if (groupId && groupCount > 1) {
                    return false;
                }

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

        const patient = state.patients.find(p => p.id == app.patientId);
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
                    <div class="searchable-select-container" id="patientSelectContainer">
                        <input type="hidden" id="appPatient" class="searchable-select-hidden" required>
                        <div class="searchable-select-trigger">
                            <input type="text" class="searchable-select-input" placeholder="Buscar paciente..." autocomplete="off">
                            <i class="fas fa-chevron-down searchable-select-icon"></i>
                        </div>
                        <div class="searchable-select-dropdown hidden">
                            <div class="searchable-select-options"></div>
                        </div>
                    </div>
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
                <div style="display: flex; gap: 16px; align-items: flex-start; margin-bottom: 20px;">
                    <div class="form-group" style="flex: 1; margin-bottom: 0;">
                        <label>Recorrência</label>
                        <select id="appRecurring">
                            <option value="none">Nenhuma</option>
                            <option value="weekly" selected>Semanal</option>
                        </select>
                    </div>
                    <div class="form-group" id="recurringCountGroup" style="flex: 1; margin-bottom: 0;">
                        <label>Repetições (Semanas)</label>
                        <input type="number" id="appRecurringCount" value="48" min="1" max="52" placeholder="Ex: 48">
                    </div>
                </div>
                <small style="color: var(--text-muted); display: block; margin-top: -12px; margin-bottom: 20px; font-size: 11px;">
                    Agende para as próximas X semanas (Ex: 1 para apenas hoje, 48 para 48 semanas).
                </small>
                <button type="submit" class="btn-primary" style="width: 100%; justify-content: center;">Salvar Agendamento</button>
            </form>
        `;

        elements.modalOverlay.classList.remove('hidden');

        // Inicializar o dropdown dinâmico de pacientes
        const patientContainer = document.getElementById('patientSelectContainer');
        const patientOptions = state.patients.map(p => ({ id: p.id, name: p.name })).sort((a, b) => a.name.localeCompare(b.name));
        initSearchableSelect(patientContainer, patientOptions, '', (id) => {
            console.log("Paciente selecionado:", id);
        });

        // Toggle recurring count field
        const recurringSelect = document.getElementById('appRecurring');
        const countGroup = document.getElementById('recurringCountGroup');

        recurringSelect.addEventListener('change', () => {
            countGroup.style.display = recurringSelect.value === 'none' ? 'none' : 'block';
        });

        // Initial state
        countGroup.style.display = recurringSelect.value === 'none' ? 'none' : 'block';

        document.getElementById('appointmentForm').onsubmit = async (e) => {
            e.preventDefault();

            const patientId = document.getElementById('appPatient').value;
            if (!patientId) {
                const searchInput = patientContainer.querySelector('.searchable-select-input');
                if (searchInput) {
                    searchInput.focus();
                    searchInput.style.borderColor = '#ef4444';
                    setTimeout(() => {
                        searchInput.style.borderColor = '';
                    }, 3000);
                }
                alert("Por favor, selecione um paciente na lista.");
                return;
            }

            const professionalId = document.getElementById('appProfessional').value;
            const startDate = document.getElementById('appDate').value;
            const appTime = document.getElementById('appTime').value;
            const duration = parseInt(document.getElementById('appDuration').value);
            const recurringType = document.getElementById('appRecurring').value;
            const recurringCount = parseInt(document.getElementById('appRecurringCount').value) || 1;

            if (recurringType === 'weekly') {
                // Create N appointments based on recurringCount
                const [year, month, day] = startDate.split('-').map(Number);
                let currentDate = new Date(year, month - 1, day);
                const recurringGroupId = Date.now().toString();

                for (let i = 0; i < recurringCount; i++) {
                    const dateStr = formatDateISO(currentDate);
                    const newApp = {
                        id: (Date.now() + i).toString(),
                        patientId,
                        professionalId,
                        date: dateStr,
                        time: appTime,
                        duration,
                        recurring: true,
                        recurringType: 'weekly',
                        recurringGroupId: recurringGroupId,
                        status: 'scheduled'
                    };
                    await saveData('appointments', newApp);

                    // Increment date by 7 days for next occurrence
                    currentDate.setDate(currentDate.getDate() + 7);
                }
            } else {
                // Single appointment (None selected)
                const newApp = {
                    id: Date.now().toString(),
                    patientId,
                    professionalId,
                    date: startDate,
                    time: appTime,
                    duration,
                    recurring: false,
                    recurringType: 'none',
                    recurringGroupId: null,
                    status: 'scheduled'
                };
                await saveData('appointments', newApp);
            }

            elements.modalOverlay.classList.add('hidden');
        };
    };

    const openAppointmentDetails = (app) => {
        const patient = state.patients.find(p => p.id == app.patientId);
        const prof = state.professionals.find(p => p.id == app.professionalId);

        elements.modalTitle.innerText = 'Detalhes do Agendamento';
        elements.modalBody.innerHTML = `
            <div class="details">
                <p><strong>Paciente:</strong> ${patient ? patient.name : 'Desconhecido'}</p>
                <p><strong>Profissional:</strong> ${prof ? prof.name : 'Desconhecido'}</p>
                <p><strong>Data:</strong> ${app.date}</p>
                <p><strong>Horário:</strong> ${app.time} (${app.duration} min)</p>
                <p><strong>Status:</strong> ${app.status === 'present' ? 'Presente' : (app.status === 'absent' ? 'Não Compareceu' : (app.status === 'absent_notice' ? 'Faltou com Aviso' : (app.status === 'cancelled_prof' ? 'Cancelado pelo Profissional' : 'Agendado')))}</p>
                <div class="actions" style="margin-top: 20px; display: flex; flex-direction: column; gap: 10px;">
                    <div style="display: flex; gap: 10px;">
                        <button id="markPresent" class="btn-primary" style="background-color: #10b981; flex: 1; justify-content: center;"><i class="fas fa-check"></i> Marcar Presença</button>
                        <button id="markAbsent" class="btn-primary" style="background-color: #ef4444; flex: 1; justify-content: center;"><i class="fas fa-times"></i> Não Compareceu</button>
                    </div>
                    <button id="markAbsentNotice" class="btn-primary" style="background-color: #f59e0b; width: 100%; justify-content: center;"><i class="fas fa-exclamation-triangle"></i> Faltou com aviso prévio</button>
                    <button id="markCancelledProf" class="btn-primary" style="background-color: #7c3aed; width: 100%; justify-content: center;"><i class="fas fa-user-times"></i> Cancelado pelo Profissional</button>
                    <div style="display: flex; gap: 10px;">
                        <button id="editApp" class="btn-secondary" style="flex: 1; justify-content: center; margin-left: 0;"><i class="fas fa-edit"></i> Editar</button>
                        ${state.currentUser.role === 'admin' ? '<button id="deleteApp" class="btn-primary" style="background-color: #64748b; flex: 1; justify-content: center;"><i class="fas fa-trash"></i> Excluir</button>' : ''}
                    </div>
                </div>
            </div>
        `;

        elements.modalOverlay.classList.remove('hidden');

        document.getElementById('markPresent').onclick = async () => {
            app.status = 'present';
            await saveData('appointments', app);
            elements.modalOverlay.classList.add('hidden');
        };

        document.getElementById('markAbsent').onclick = async () => {
            app.status = 'absent';
            await saveData('appointments', app);
            elements.modalOverlay.classList.add('hidden');
        };

        document.getElementById('markAbsentNotice').onclick = async () => {
            app.status = 'absent_notice';
            await saveData('appointments', app);
            elements.modalOverlay.classList.add('hidden');
        };

        document.getElementById('markCancelledProf').onclick = async () => {
            app.status = 'cancelled_prof';
            await saveData('appointments', app);
            elements.modalOverlay.classList.add('hidden');
        };

        document.getElementById('editApp').onclick = () => {
            openEditAppointmentModal(app);
        };

        const deleteBtn = document.getElementById('deleteApp');
        if (deleteBtn) {
            deleteBtn.onclick = async () => {
                const normalizeId = (id) => {
                    if (id === null || id === undefined) return '';
                    return String(id).trim();
                };

                const normalizeTime = (t) => {
                    if (!t) return '';
                    const parts = String(t).trim().split(':');
                    if (parts.length === 0) return '';
                    const hours = parts[0].padStart(2, '0');
                    const minutes = (parts[1] || '00').padStart(2, '0');
                    return `${hours}:${minutes}`;
                };

                const parseDateToTime = (dateStr) => {
                    if (!dateStr) return 0;
                    let year, month, day;
                    if (dateStr.includes('-')) {
                        [year, month, day] = dateStr.split('-').map(Number);
                    } else if (dateStr.includes('/')) {
                        [day, month, year] = dateStr.split('/').map(Number);
                    } else {
                        return 0;
                    }
                    return new Date(year, month - 1, day).getTime();
                };

                const getWeekday = (dateStr) => {
                    if (!dateStr) return null;
                    let year, month, day;
                    if (dateStr.includes('-')) {
                        [year, month, day] = dateStr.split('-').map(Number);
                    } else if (dateStr.includes('/')) {
                        [day, month, year] = dateStr.split('/').map(Number);
                    } else {
                        return null;
                    }
                    return new Date(year, month - 1, day).getDay();
                };

                let sequenceApps = [];
                const appIdStr = normalizeId(app.id);
                const appPatientIdStr = normalizeId(app.patientId);
                const appProfessionalIdStr = normalizeId(app.professionalId);
                const appTimeNorm = normalizeTime(app.time);
                const appDateVal = parseDateToTime(app.date);
                const currentWeekday = getWeekday(app.date);

                const isFutureAndPending = (a) => {
                    if (!a.date || normalizeId(a.id) === appIdStr) return false;
                    const isFuture = parseDateToTime(a.date) > appDateVal;
                    const isNotOccurred = !['present', 'absent', 'absent_notice', 'cancelled_prof'].includes(a.status);
                    return isFuture && isNotOccurred;
                };

                if (app.recurringGroupId && String(app.recurringGroupId).trim() !== '' && String(app.recurringGroupId) !== 'null' && String(app.recurringGroupId) !== 'undefined') {
                    sequenceApps = state.appointments.filter(a => {
                        if (!isFutureAndPending(a)) return false;
                        
                        const sameGroup = (normalizeId(a.recurringGroupId) === normalizeId(app.recurringGroupId));
                        const matchHeuristic = (
                            normalizeId(a.patientId) === appPatientIdStr &&
                            normalizeId(a.professionalId) === appProfessionalIdStr &&
                            normalizeTime(a.time) === appTimeNorm &&
                            getWeekday(a.date) === currentWeekday
                        );
                        
                        return sameGroup || matchHeuristic;
                    });
                } else {
                    sequenceApps = state.appointments.filter(a => {
                        if (!isFutureAndPending(a)) return false;
                        
                        return (
                            normalizeId(a.patientId) === appPatientIdStr &&
                            normalizeId(a.professionalId) === appProfessionalIdStr &&
                            normalizeTime(a.time) === appTimeNorm &&
                            getWeekday(a.date) === currentWeekday
                        );
                    });
                }

                // Show a premium confirmation screen inside the modal body!
                elements.modalTitle.innerText = 'Excluir Agendamento';
                elements.modalBody.innerHTML = `
                    <div class="confirm-delete-view" style="display: flex; flex-direction: column; align-items: center; text-align: center; padding: 20px; gap: 20px;">
                        <div style="width: 64px; height: 64px; background: #fee2e2; color: #ef4444; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 28px;">
                            <i class="fas fa-exclamation-triangle"></i>
                        </div>
                        <div>
                            <h3 style="font-size: 18px; font-weight: 600; color: var(--text-main); margin: 0 0 8px 0;">Tem certeza que deseja excluir?</h3>
                            <p style="font-size: 14px; color: var(--text-muted); margin: 0; line-height: 1.5;">O agendamento de <strong>${patient ? patient.name : 'Desconhecido'}</strong> em <strong>${app.date}</strong> às <strong>${app.time}</strong> será removido permanentemente.</p>
                        </div>
                        
                        ${sequenceApps.length > 0 ? `
                            <div style="background: var(--bg); border: 1px solid var(--border); border-radius: 8px; padding: 16px; text-align: left; width: 100%;">
                                <p style="font-size: 13px; color: var(--text-main); font-weight: 600; margin: 0 0 8px 0; display: flex; align-items: center; gap: 8px;">
                                    <i class="fas fa-redo-alt" style="color: var(--primary);"></i> Série Recorrente Detectada
                                </p>
                                <p style="font-size: 12px; color: var(--text-muted); margin: 0; line-height: 1.4;">Encontramos mais <strong>${sequenceApps.length} agendamentos futuros pendentes</strong> pertencentes a essa mesma sequência semanal (agendamentos antigos ou já ocorridos serão preservados).</p>
                            </div>
                        ` : ''}

                        <div style="display: flex; flex-direction: column; gap: 10px; width: 100%; margin-top: 10px;">
                            ${sequenceApps.length > 0 ? `
                                <button id="btnDeleteSequence" class="btn-primary" style="background-color: #ef4444; justify-content: center; width: 100%;">
                                    <i class="fas fa-trash-alt"></i> Excluir este e futuros agendados (${sequenceApps.length + 1})
                                </button>
                                <button id="btnDeleteOnlyThis" class="btn-secondary" style="color: #ef4444; border-color: #fca5a5; justify-content: center; width: 100%;">
                                    <i class="fas fa-minus-circle"></i> Excluir apenas este agendamento
                                </button>
                            ` : `
                                <button id="btnConfirmDeleteSingle" class="btn-primary" style="background-color: #ef4444; justify-content: center; width: 100%;">
                                    <i class="fas fa-trash-alt"></i> Confirmar Exclusão
                                </button>
                            `}
                            <button id="btnCancelDelete" class="btn-secondary" style="justify-content: center; width: 100%; margin-left: 0;">
                                Voltar para Detalhes
                            </button>
                        </div>
                    </div>
                `;

                // Bulletproof deletion function
                const batchDelete = async (ids) => {
                    if (!state.currentClinicId) return;
                    console.log("Iniciando exclusão dos agendamentos:", ids);
                    
                    const cleanIds = ids
                        .filter(id => id !== null && id !== undefined && id !== '')
                        .map(id => String(id).trim());

                    if (cleanIds.length === 0) return;

                    try {
                        // Deletar individualmente para evitar falhas atômicas de lote (batch failures)
                        const deletePromises = cleanIds.map(async (id) => {
                            try {
                                await db.collection('clinics')
                                    .doc(state.currentClinicId)
                                    .collection('appointments')
                                    .doc(id)
                                    .delete();
                                console.log(`Agendamento ${id} excluído com sucesso do Firestore.`);
                            } catch (err) {
                                console.error(`Erro ao excluir agendamento ${id} no Firestore:`, err);
                                throw err;
                            }
                        });

                        const results = await Promise.allSettled(deletePromises);
                        const rejected = results.filter(r => r.status === 'rejected');
                        
                        if (rejected.length === cleanIds.length) {
                            alert("Não foi possível excluir os agendamentos. Verifique sua conexão ou permissões.");
                        } else if (rejected.length > 0) {
                            console.warn(`${rejected.length} agendamentos falharam ao excluir de um total de ${cleanIds.length}.`);
                        }
                    } catch (e) {
                        console.error("Erro na exclusão geral:", e);
                        alert("Erro ao excluir agendamentos.");
                    }
                };

                const setDeletingState = (clickedBtnId) => {
                    const btnIds = ['btnDeleteSequence', 'btnDeleteOnlyThis', 'btnConfirmDeleteSingle', 'btnCancelDelete'];
                    btnIds.forEach(id => {
                        const btn = document.getElementById(id);
                        if (btn) {
                            btn.disabled = true;
                            if (id === clickedBtnId) {
                                btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Excluindo...`;
                                btn.style.opacity = '0.7';
                            } else {
                                btn.style.opacity = '0.4';
                                btn.style.pointerEvents = 'none';
                            }
                        }
                    });
                };

                const optimisticLocalDelete = (idsToDelete) => {
                    // Normalizar todos os IDs a serem excluídos para String limpa
                    const normalizedToDelete = idsToDelete
                        .filter(id => id !== null && id !== undefined)
                        .map(id => String(id).trim());

                    // Adicionar ao recém-deletados no estado global
                    normalizedToDelete.forEach(id => state.recentlyDeletedIds.add(id));
                    
                    // Filtrar agendamentos usando comparação normalizada em string
                    state.appointments = state.appointments.filter(a => {
                        const aNormId = a.id !== null && a.id !== undefined ? String(a.id).trim() : '';
                        return !normalizedToDelete.includes(aNormId);
                    });
                    renderView();
                };

                // Attach handlers to confirmation modal buttons
                if (sequenceApps.length > 0) {
                    document.getElementById('btnDeleteSequence').onclick = async () => {
                        setDeletingState('btnDeleteSequence');
                        const toDeleteIds = [app.id, ...sequenceApps.map(a => a.id)].filter(id => id);
                        optimisticLocalDelete(toDeleteIds);
                        await batchDelete(toDeleteIds);
                        elements.modalOverlay.classList.add('hidden');
                    };

                    document.getElementById('btnDeleteOnlyThis').onclick = async () => {
                        setDeletingState('btnDeleteOnlyThis');
                        optimisticLocalDelete([app.id]);
                        await batchDelete([app.id]);
                        elements.modalOverlay.classList.add('hidden');
                    };
                } else {
                    document.getElementById('btnConfirmDeleteSingle').onclick = async () => {
                        setDeletingState('btnConfirmDeleteSingle');
                        optimisticLocalDelete([app.id]);
                        await batchDelete([app.id]);
                        elements.modalOverlay.classList.add('hidden');
                    };
                }

                document.getElementById('btnCancelDelete').onclick = () => {
                    openAppointmentDetails(app);
                };
            };
        }
    };

    const openEditAppointmentModal = (app) => {
        elements.modalTitle.innerText = 'Editar Agendamento';
        elements.modalBody.innerHTML = `
            <form id="editAppointmentForm">
                <div class="form-group">
                    <label>Paciente</label>
                    <div class="searchable-select-container" id="patientSelectContainer">
                        <input type="hidden" id="appPatient" class="searchable-select-hidden" value="${app.patientId}" required>
                        <div class="searchable-select-trigger">
                            <input type="text" class="searchable-select-input" placeholder="Buscar paciente..." autocomplete="off">
                            <i class="fas fa-chevron-down searchable-select-icon"></i>
                        </div>
                        <div class="searchable-select-dropdown hidden">
                            <div class="searchable-select-options"></div>
                        </div>
                    </div>
                </div>
                <div class="form-group">
                    <label>Profissional</label>
                    <select id="appProfessional" required>
                        ${state.professionals.map(p => `<option value="${p.id}" ${p.id == app.professionalId ? 'selected' : ''}>${p.name}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label>Data</label>
                    <input type="date" id="appDate" value="${app.date}" required>
                </div>
                <div class="form-group">
                    <label>Horário</label>
                    <input type="time" id="appTime" value="${app.time}" required>
                </div>
                <div class="form-group">
                    <label>Duração (minutos)</label>
                    <input type="number" id="appDuration" value="${app.duration || 45}" required>
                </div>
                <div style="display: flex; gap: 16px; align-items: flex-start; margin-bottom: 20px;">
                    <div class="form-group" style="flex: 1; margin-bottom: 0;">
                        <label>Recorrência</label>
                        <select id="appRecurring">
                            <option value="none" ${!app.recurring ? 'selected' : ''}>Nenhuma</option>
                            <option value="weekly" ${app.recurringType === 'weekly' ? 'selected' : ''}>Semanal</option>
                        </select>
                    </div>
                    <div class="form-group" id="editRecurringCountGroup" style="flex: 1; margin-bottom: 0; ${!app.recurring ? 'display: none;' : ''}">
                        <label>Repetições (Semanas)</label>
                        <input type="number" id="appRecurringCount" value="48" min="1" max="52">
                    </div>
                </div>
                <small style="color: var(--text-muted); display: block; margin-top: -12px; margin-bottom: 20px; font-size: 11px;">
                    Informe quantas semanas deseja agendar a partir desta data.
                </small>
                <button type="submit" class="btn-primary" style="width: 100%; justify-content: center;">Salvar Alterações</button>
            </form>
        `;

        elements.modalOverlay.classList.remove('hidden');

        // Inicializar o dropdown dinâmico de pacientes com o valor atual pré-selecionado
        const patientContainer = document.getElementById('patientSelectContainer');
        const patientOptions = state.patients.map(p => ({ id: p.id, name: p.name })).sort((a, b) => a.name.localeCompare(b.name));
        initSearchableSelect(patientContainer, patientOptions, app.patientId, (id) => {
            console.log("Paciente selecionado na edição:", id);
        });

        const recurringSelect = document.getElementById('appRecurring');
        const countGroup = document.getElementById('editRecurringCountGroup');

        recurringSelect.addEventListener('change', () => {
            countGroup.style.display = recurringSelect.value === 'none' ? 'none' : 'block';
        });

        document.getElementById('editAppointmentForm').onsubmit = async (e) => {
            e.preventDefault();

            const patientId = document.getElementById('appPatient').value;
            const professionalId = document.getElementById('appProfessional').value;
            const startDate = document.getElementById('appDate').value;
            const appTime = document.getElementById('appTime').value;
            const duration = parseInt(document.getElementById('appDuration').value);
            const recurringType = document.getElementById('appRecurring').value;
            const recurringCount = parseInt(document.getElementById('appRecurringCount').value) || 1;

            if (recurringType === 'weekly') {
                // Create multiple appointments
                const [year, month, day] = startDate.split('-').map(Number);
                let currentDate = new Date(year, month - 1, day);
                const recurringGroupId = Date.now().toString();

                // Update original
                app.patientId = patientId;
                app.professionalId = professionalId;
                app.date = formatDateISO(currentDate);
                app.time = appTime;
                app.duration = duration;
                app.recurring = true;
                app.recurringType = 'weekly';
                app.recurringGroupId = recurringGroupId;
                await saveData('appointments', app);

                // Create N-1 more if recurringCount > 1
                for (let i = 1; i < recurringCount; i++) {
                    currentDate.setDate(currentDate.getDate() + 7);
                    const dateStr = formatDateISO(currentDate);
                    const newApp = {
                        id: (Date.now() + i).toString(),
                        patientId,
                        professionalId,
                        date: dateStr,
                        time: appTime,
                        duration,
                        recurring: true,
                        recurringType: 'weekly',
                        recurringGroupId: recurringGroupId,
                        status: 'scheduled'
                    };
                    await saveData('appointments', newApp);
                }
            } else {
                app.patientId = patientId;
                app.professionalId = professionalId;
                app.date = startDate;
                app.time = appTime;
                app.duration = duration;
                app.recurring = false;
                app.recurringType = 'none';
                app.recurringGroupId = app.recurringGroupId || null;
                await saveData('appointments', app);
            }

            elements.modalOverlay.classList.add('hidden');
        };
    };

    const renderPacientes = () => {
        elements.viewTitle.innerText = 'Gestão de Pacientes';

        const existingSearch = document.getElementById('patientSearch');
        const lastTerm = existingSearch ? existingSearch.value : "";

        elements.viewContent.innerHTML = `
            <div class="card" style="background: white; padding: 24px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
                <div class="view-header-row">
                    <h3 style="white-space: nowrap; margin: 0;">Lista de Pacientes</h3>
                    <div style="position: relative; flex: 1; max-width: 400px;">
                        <i class="fas fa-search" style="position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--text-muted);"></i>
                        <input type="text" id="patientSearch" placeholder="Buscar por nome, responsável ou telefone..." value="${lastTerm}" style="width: 100%; padding: 10px 10px 10px 40px; border-radius: 8px; border: 1px solid var(--border); font-size: 14px; outline: none; transition: border-color 0.2s;">
                    </div>
                    <button class="btn-primary" id="newPatientBtn" style="margin: 0;"><i class="fas fa-plus"></i> Novo Paciente</button>
                </div>
                <div style="overflow-x: auto;">
                    <table style="width: 100%; border-collapse: collapse; min-width: 600px;">
                        <thead>
                            <tr style="text-align: left; border-bottom: 1px solid #e2e8f0;">
                                <th style="padding: 12px;">Nome</th>
                                <th style="padding: 12px;">Telefone</th>
                                <th style="padding: 12px;">Cidade</th>
                                <th style="padding: 12px;">Convênio</th>
                                <th style="padding: 12px;">Ações</th>
                            </tr>
                        </thead>
                        <tbody id="patientTableBody"></tbody>
                    </table>
                </div>
            </div>
        `;

        // Focus management
        const newSearch = document.getElementById('patientSearch');
        if (existingSearch === document.activeElement) {
            newSearch.focus();
            newSearch.setSelectionRange(newSearch.value.length, newSearch.value.length);
        }

        const getInsuranceHTML = (selectedInsurances = []) => {
            if (!Array.isArray(selectedInsurances)) selectedInsurances = [selectedInsurances];
            if (selectedInsurances.length === 0) selectedInsurances = ['Particular'];
            const insurances = ['Particular', ...state.insurances.map(i => i.name)];
            return `
                <div class="insurance-options" style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 8px;">
                    ${insurances.map(name => `
                        <label class="checkbox-container" style="display: flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer; padding: 8px; border: 1px solid var(--border); border-radius: 8px; transition: all 0.2s;">
                            <input type="checkbox" name="pInsurance" value="${name}" ${selectedInsurances.includes(name) ? 'checked' : ''} style="cursor: pointer;">
                            <span>${name}</span>
                        </label>
                    `).join('')}
                </div>
                <div style="margin-top: 12px;">
                    <div style="display: flex; gap: 8px;">
                        <input type="text" id="newInsuranceName" placeholder="Novo convênio..." style="flex: 1; padding: 8px; border-radius: 6px; border: 1px solid var(--border); font-size: 13px;">
                        <button type="button" id="addInsuranceBtn" class="btn-secondary" style="padding: 8px 12px; margin: 0; font-size: 12px;"><i class="fas fa-plus"></i></button>
                    </div>
                </div>
            `;
        };

        const attachInsuranceLogic = () => {
            const addBtn = document.getElementById('addInsuranceBtn');
            if (addBtn) {
                addBtn.onclick = async () => {
                    const name = document.getElementById('newInsuranceName').value.trim();
                    if (name) {
                        if (!state.insurances.find(i => i.name.toLowerCase() === name.toLowerCase())) {
                            await saveData('insurances', { id: 'ins_' + Date.now(), name: name });
                        }
                        const selected = Array.from(document.querySelectorAll('input[name="pInsurance"]:checked')).map(cb => cb.value);
                        if (!selected.includes(name)) selected.push(name);
                        const container = document.getElementById('insuranceContainer');
                        if (container) {
                            container.innerHTML = getInsuranceHTML(selected);
                            attachInsuranceLogic();
                        }
                    }
                };
            }
        };

        const renderTableRows = (term = "") => {
            const tbody = document.getElementById('patientTableBody');
            const filtered = state.patients.filter(p =>
                p.name.toLowerCase().includes(term.toLowerCase()) ||
                (p.responsible && p.responsible.toLowerCase().includes(term.toLowerCase())) ||
                (p.phone && p.phone.includes(term)) ||
                (p.city && p.city.toLowerCase().includes(term.toLowerCase()))
            );

            tbody.innerHTML = filtered.map(p => `
                <tr style="border-bottom: 1px solid #f1f5f9;">
                    <td style="padding: 12px;">
                        <div class="patient-name-link" data-id="${p.id}" style="font-weight: 600; color: var(--primary); cursor: pointer;">${p.name}</div>
                        <div style="font-size: 11px; color: var(--text-muted);">${p.responsible ? `Resp: ${p.responsible}` : ''} ${p.age ? `| ${p.age} anos` : ''}</div>
                    </td>
                    <td style="padding: 12px;">
                        ${p.phone ? `
                            <a href="https://wa.me/55${cleanPhone(p.phone)}" target="_blank" class="phone-link" style="text-decoration: none; color: inherit; display: flex; align-items: center; gap: 6px;">
                                <i class="fab fa-whatsapp" style="color: #25d366;"></i>
                                ${p.phone}
                            </a>
                        ` : '-'}
                    </td>
                    <td style="padding: 12px;">${p.city || '-'}</td>
                    <td style="padding: 12px;">
                        <div style="display: flex; flex-wrap: wrap; gap: 4px;">
                            ${(Array.isArray(p.insurance) ? p.insurance : [p.insurance || 'Particular']).map(ins => `
                                <span class="badge-insurance" style="background: ${ins === 'Particular' ? '#f1f5f9' : '#dbeafe'}; color: ${ins === 'Particular' ? '#64748b' : '#2563eb'}; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 600;">
                                    ${ins}
                                </span>
                            `).join('')}
                        </div>
                    </td>
                    <td style="padding: 12px;">
                        <button class="edit-patient-btn" data-id="${p.id}" title="Editar" style="background: none; border: none; color: #64748b; cursor: pointer; margin-right: 8px;"><i class="fas fa-edit"></i></button>
                        <button class="delete-patient-btn" data-id="${p.id}" title="Excluir" style="background: none; border: none; color: #ef4444; cursor: pointer;"><i class="fas fa-trash"></i></button>
                    </td>
                </tr>
            `).join('');

            tbody.querySelectorAll('.edit-patient-btn').forEach(btn => {
                btn.onclick = () => {
                    const patient = state.patients.find(p => p.id === btn.dataset.id);
                    if (patient) openEditModal(patient);
                };
            });

            tbody.querySelectorAll('.delete-patient-btn').forEach(btn => {
                btn.onclick = async () => {
                    if (confirm('Tem certeza que deseja excluir este paciente?')) {
                        await deleteData('patients', btn.dataset.id);
                    }
                };
            });

            tbody.querySelectorAll('.patient-name-link').forEach(link => {
                link.onclick = () => {
                    const patient = state.patients.find(p => p.id === link.dataset.id);
                    if (patient) openPatientDetails(patient);
                };
            });
        };

        const openEditModal = (patient) => {
            elements.modalTitle.innerText = 'Editar Paciente';
            elements.modalBody.innerHTML = `
                <form id="editPatientForm">
                    <div class="grid-2-cols">
                        <div class="form-group" style="grid-column: span 2;"><label>Nome Completo</label><input type="text" id="pName" value="${patient.name}" required></div>
                        <div class="form-group"><label>Telefone</label><input type="text" id="pPhone" value="${patient.phone || ''}"></div>
                        <div class="form-group"><label>Responsável</label><input type="text" id="pResponsible" value="${patient.responsible || ''}"></div>
                        <div class="form-group"><label>Idade</label><input type="number" id="pAge" value="${patient.age || ''}"></div>
                        <div class="form-group"><label>Cidade</label><input type="text" id="pCity" value="${patient.city || ''}"></div>
                    </div>
                    <div class="form-group">
                        <label>Convênio</label>
                        <div id="insuranceContainer">${getInsuranceHTML(patient.insurance || 'Particular')}</div>
                    </div>
                    <button type="submit" class="btn-primary" style="width: 100%; justify-content: center; margin-top: 20px;">Atualizar Paciente</button>
                </form>
            `;
            elements.modalOverlay.classList.remove('hidden');
            attachInsuranceLogic();
            document.getElementById('editPatientForm').onsubmit = async (e) => {
                e.preventDefault();
                patient.name = document.getElementById('pName').value;
                patient.phone = document.getElementById('pPhone').value;
                patient.responsible = document.getElementById('pResponsible').value;
                patient.age = document.getElementById('pAge').value;
                patient.city = document.getElementById('pCity').value;
                patient.insurance = Array.from(document.querySelectorAll('input[name="pInsurance"]:checked')).map(cb => cb.value);
                await saveData('patients', patient);
                elements.modalOverlay.classList.add('hidden');
            };
        };

        newSearch.oninput = (e) => renderTableRows(e.target.value);
        renderTableRows(lastTerm);

        document.getElementById('newPatientBtn').onclick = () => {
            elements.modalTitle.innerText = 'Novo Paciente';
            elements.modalBody.innerHTML = `
                <form id="patientForm">
                    <div class="grid-2-cols">
                        <div class="form-group" style="grid-column: span 2;"><label>Nome Completo</label><input type="text" id="pName" required></div>
                        <div class="form-group"><label>Telefone</label><input type="text" id="pPhone"></div>
                        <div class="form-group"><label>Responsável</label><input type="text" id="pResponsible"></div>
                        <div class="form-group"><label>Idade</label><input type="number" id="pAge"></div>
                        <div class="form-group"><label>Cidade</label><input type="text" id="pCity"></div>
                    </div>
                    <div class="form-group">
                        <label>Convênio</label>
                        <div id="insuranceContainer">${getInsuranceHTML('Particular')}</div>
                    </div>
                    <button type="submit" class="btn-primary" style="width: 100%; justify-content: center; margin-top: 20px;">Salvar Paciente</button>
                </form>
            `;
            elements.modalOverlay.classList.remove('hidden');
            attachInsuranceLogic();
            document.getElementById('patientForm').onsubmit = async (e) => {
                e.preventDefault();
                const p = {
                    id: Date.now().toString(),
                    name: document.getElementById('pName').value,
                    phone: document.getElementById('pPhone').value,
                    responsible: document.getElementById('pResponsible').value,
                    age: document.getElementById('pAge').value,
                    city: document.getElementById('pCity').value,
                    insurance: Array.from(document.querySelectorAll('input[name="pInsurance"]:checked')).map(cb => cb.value)
                };
                await saveData('patients', p);
                elements.modalOverlay.classList.add('hidden');
            };
        };
    };

    const openPatientDetails = (p) => {
        elements.modalTitle.innerText = 'Dados do Paciente';
        const insurances = Array.isArray(p.insurance) ? p.insurance : [p.insurance || 'Particular'];

        elements.modalBody.innerHTML = `
            <div class="patient-details-view" style="display: flex; flex-direction: column; gap: 20px;">
                <div style="display: flex; align-items: center; gap: 20px; padding-bottom: 20px; border-bottom: 1px solid var(--border);">
                    <div style="width: 64px; height: 64px; background: var(--primary-light); color: var(--primary); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 24px; font-weight: bold;">
                        ${p.name.substring(0, 2).toUpperCase()}
                    </div>
                    <div>
                        <h2 style="font-size: 20px; margin: 0; color: var(--text-main);">${p.name}</h2>
                        <p style="margin: 4px 0 0; color: var(--text-muted); font-size: 14px;">Paciente cadastrado</p>
                    </div>
                </div>

                <div class="grid-2-cols" style="gap: 20px;">
                    <div class="detail-item">
                        <label style="display: block; font-size: 12px; color: var(--text-muted); margin-bottom: 4px; font-weight: 500;">TELEFONE</label>
                        <div style="font-weight: 600; color: var(--text-main);">
                            ${p.phone ? `
                                <a href="https://wa.me/55${cleanPhone(p.phone)}" target="_blank" class="phone-link" style="text-decoration: none; color: inherit; display: flex; align-items: center; gap: 8px;">
                                    <i class="fab fa-whatsapp" style="font-size: 18px; color: #25d366;"></i>
                                    ${p.phone}
                                </a>
                            ` : 'Sem telefone'}
                        </div>
                    </div>
                    <div class="detail-item">
                        <label style="display: block; font-size: 12px; color: var(--text-muted); margin-bottom: 4px; font-weight: 500;">RESPONSÁVEL</label>
                        <div style="font-weight: 600; color: var(--text-main);"><i class="fas fa-user-friends" style="width: 20px; color: var(--primary);"></i> ${p.responsible || 'O Próprio'}</div>
                    </div>
                    <div class="detail-item">
                        <label style="display: block; font-size: 12px; color: var(--text-muted); margin-bottom: 4px; font-weight: 500;">IDADE</label>
                        <div style="font-weight: 600; color: var(--text-main);"><i class="fas fa-birthday-cake" style="width: 20px; color: var(--primary);"></i> ${p.age ? `${p.age} anos` : 'Não informada'}</div>
                    </div>
                    <div class="detail-item">
                        <label style="display: block; font-size: 12px; color: var(--text-muted); margin-bottom: 4px; font-weight: 500;">CIDADE</label>
                        <div style="font-weight: 600; color: var(--text-main);"><i class="fas fa-map-marker-alt" style="width: 20px; color: var(--primary);"></i> ${p.city || 'Não informada'}</div>
                    </div>
                </div>

                <div class="detail-item">
                    <label style="display: block; font-size: 12px; color: var(--text-muted); margin-bottom: 12px; font-weight: 500;">CONVÊNIOS ATIVOS</label>
                    <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                        ${insurances.map(ins => `
                            <div style="background: ${ins === 'Particular' ? '#f8fafc' : '#eff6ff'}; border: 1px solid ${ins === 'Particular' ? '#e2e8f0' : '#bfdbfe'}; padding: 8px 16px; border-radius: 8px; font-weight: 600; color: ${ins === 'Particular' ? '#64748b' : '#1d4ed8'}; font-size: 13px; display: flex; align-items: center; gap: 8px;">
                                <i class="fas ${ins === 'Particular' ? 'fa-wallet' : 'fa-id-card'}"></i>
                                ${ins}
                            </div>
                        `).join('')}
                    </div>
                </div>

                <div style="margin-top: 10px; padding-top: 20px; border-top: 1px solid var(--border); display: flex; gap: 12px;">
                    <button id="editFromDetails" class="btn-secondary" style="flex: 1; justify-content: center;"><i class="fas fa-edit"></i> Editar Dados</button>
                    <button onclick="document.getElementById('modalOverlay').classList.add('hidden')" class="btn-primary" style="flex: 1; justify-content: center;">Fechar</button>
                </div>
            </div>
        `;

        elements.modalOverlay.classList.remove('hidden');

        document.getElementById('editFromDetails').onclick = () => {
            // Trigger the existing edit logic
            const editBtn = document.querySelector(`.edit-btn[data-id="${p.id}"]`);
            if (editBtn) editBtn.click();
        };
    };

    const renderProfissionais = () => {
        elements.viewTitle.innerText = 'Gestão de Profissionais';
        elements.viewContent.innerHTML = `
            <div class="card" style="background: white; padding: 24px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
                <div class="view-header-row" style="margin-bottom: 20px;">
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
            document.getElementById('profForm').onsubmit = async (e) => {
                e.preventDefault();
                const p = {
                    id: Date.now().toString(),
                    name: document.getElementById('prName').value,
                    specialty: document.getElementById('prSpec').value,
                    password: document.getElementById('prPass').value,
                    color: '#' + Math.floor(Math.random() * 16777215).toString(16)
                };
                await saveData('professionals', p);
                elements.modalOverlay.classList.add('hidden');
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
                    document.getElementById('editProfForm').onsubmit = async (e) => {
                        e.preventDefault();
                        prof.name = document.getElementById('prName').value;
                        prof.specialty = document.getElementById('prSpec').value;
                        prof.password = document.getElementById('prPass').value;
                        await saveData('professionals', prof);
                        elements.modalOverlay.classList.add('hidden');
                    };
                }
            };
        });

        document.querySelectorAll('.delete-prof-btn').forEach(btn => {
            btn.onclick = async () => {
                if (confirm('Tem certeza que deseja excluir este profissional? Isso também removerá seus agendamentos.')) {
                    await deleteData('professionals', btn.dataset.id);
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
            return { id: p.id, name: p.name, count };
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
                                    <span class="prof-report-link" data-id="${p.id}" style="color: var(--primary); cursor: pointer; font-weight: 600;">${p.name}</span>
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

        // Attach listeners
        document.querySelectorAll('.prof-report-link').forEach(link => {
            link.onclick = () => openDetailedProfessionalReport(link.dataset.id);
        });
    };


    const openDetailedProfessionalReport = (profId) => {
        const prof = state.professionals.find(p => p.id === profId);
        if (!prof) return;

        const now = new Date();
        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);

        elements.modalTitle.innerText = `Relatório: ${prof.name}`;
        elements.modalBody.innerHTML = `
            <div class="detailed-report">
                <div class="grid-2-cols">
                    <div class="form-group">
                        <label>Data Inicial</label>
                        <input type="date" id="repStartDate" value="${formatDateISO(firstDay)}">
                    </div>
                    <div class="form-group">
                        <label>Data Final</label>
                        <input type="date" id="repEndDate" value="${formatDateISO(now)}">
                    </div>
                </div>
                <div class="form-group">
                    <label>Profissional</label>
                    <select id="repProfId">
                        ${state.professionals.map(p => `<option value="${p.id}" ${p.id === profId ? 'selected' : ''}>${p.name}</option>`).join('')}
                    </select>
                </div>
                <button id="generateReportBtn" class="btn-primary" style="width: 100%; justify-content: center; margin-bottom: 24px;">
                    <i class="fas fa-sync-alt"></i> Gerar Relatório
                </button>
                <div id="reportResultsContainer">
                    <div style="text-align: center; color: var(--text-muted); padding: 20px;">
                        Clique em "Gerar Relatório" para visualizar os dados.
                    </div>
                </div>
            </div>
        `;

        elements.modalOverlay.classList.remove('hidden');

        document.getElementById('generateReportBtn').onclick = () => {
            const start = document.getElementById('repStartDate').value;
            const end = document.getElementById('repEndDate').value;
            const pId = document.getElementById('repProfId').value;
            renderDetailedReportContent(pId, start, end);
        };

        // Auto-generate on open
        renderDetailedReportContent(profId, formatDateISO(firstDay), formatDateISO(now));
    };

    const renderDetailedReportContent = (profId, startDate, endDate) => {
        const container = document.getElementById('reportResultsContainer');

        const filteredApps = state.appointments.filter(app => {
            if (app.professionalId != profId) return false;
            return app.date >= startDate && app.date <= endDate;
        });

        const total = filteredApps.length;
        const present = filteredApps.filter(a => a.status == 'present').length;
        const absent = filteredApps.filter(a => a.status == 'absent' || a.status == 'absent_notice').length;

        const patients = filteredApps.map(a => {
            const p = state.patients.find(pat => pat.id == a.patientId);
            return {
                name: p ? p.name : 'Desconhecido',
                date: a.date,
                status: a.status,
                patientId: a.patientId
            };
        }).sort((a, b) => b.date.localeCompare(a.date));

        const getStatusText = (status) => {
            switch (status) {
                case 'present': return 'Presente';
                case 'absent': return 'Faltou';
                case 'absent_notice': return 'Avisou';
                case 'cancelled_prof': return 'Cancelado (Prof)';
                default: return 'Agendado';
            }
        };

        const getStatusBg = (status) => {
            switch (status) {
                case 'present': return '#dcfce7';
                case 'absent': return '#fee2e2';
                case 'absent_notice': return '#ffedd5';
                case 'cancelled_prof': return '#f3e8ff';
                default: return '#dbeafe';
            }
        };

        const getStatusColor = (status) => {
            switch (status) {
                case 'present': return '#16a34a';
                case 'absent': return '#dc2626';
                case 'absent_notice': return '#f59e0b';
                case 'cancelled_prof': return '#7c3aed';
                default: return '#2563eb';
            }
        };

        container.innerHTML = `
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 24px;">
                <div style="background: #f8fafc; padding: 12px; border-radius: 8px; text-align: center; border: 1px solid var(--border);">
                    <div style="font-size: 20px; font-weight: 700; color: var(--primary);">${total}</div>
                    <div style="font-size: 10px; color: var(--text-muted); text-transform: uppercase;">Total</div>
                </div>
                <div style="background: #f0fdf4; padding: 12px; border-radius: 8px; text-align: center; border: 1px solid #bbf7d0;">
                    <div style="font-size: 20px; font-weight: 700; color: #16a34a;">${present}</div>
                    <div style="font-size: 10px; color: #16a34a; text-transform: uppercase;">Presenças</div>
                </div>
                <div style="background: #fef2f2; padding: 12px; border-radius: 8px; text-align: center; border: 1px solid #fecaca;">
                    <div style="font-size: 20px; font-weight: 700; color: #dc2626;">${absent}</div>
                    <div style="font-size: 10px; color: #dc2626; text-transform: uppercase;">Faltas</div>
                </div>
            </div>

            <div style="border-top: 1px solid var(--border); padding-top: 16px;">
                <h4 style="font-size: 14px; margin-bottom: 12px;">Pacientes no Período</h4>
                <div style="max-height: 250px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; padding-right: 4px;">
                    ${patients.map(p => {
            const currentMonthStr = formatDateISO(new Date()).substring(0, 7);
            const monthlyCount = state.appointments.filter(app =>
                app.patientId == p.patientId &&
                app.status == 'present' &&
                app.date.startsWith(currentMonthStr)
            ).length;

            return `
                        <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; background: #f8fafc; border-radius: 6px; font-size: 13px; border: 1px solid #f1f5f9;">
                            <div>
                                <div style="font-weight: 600; color: var(--text-main);">${p.name}</div>
                                <div style="font-size: 11px; color: var(--text-muted);">${p.date.split('-').reverse().join('/')}</div>
                            </div>
                            <div style="display: flex; align-items: center; gap: 8px;">
                                ${monthlyCount > 0 ? `<span title="Total de presenças no mês" style="background: #eff6ff; color: #2563eb; font-weight: 800; padding: 2px 8px; border-radius: 4px; font-size: 11px; border: 1px solid #dbeafe; display: flex; align-items: center; gap: 4px;"><span style="font-weight: 500; font-size: 10px; opacity: 0.8;">Neste mês:</span>${monthlyCount}</span>` : ''}
                                <span style="font-size: 10px; padding: 2px 8px; border-radius: 100px; background: ${getStatusBg(p.status)}; color: ${getStatusColor(p.status)}; font-weight: 700; text-transform: uppercase;">
                                    ${getStatusText(p.status)}
                                </span>
                            </div>
                        </div>
                        `;
        }).join('')}
                    ${patients.length === 0 ? '<div style="text-align: center; color: var(--text-muted); font-size: 13px; padding: 20px;">Nenhum atendimento encontrado para este período.</div>' : ''}
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

        // Update clinic info in sidebar
        if (state.currentClinicId) {
            const clinic = getActiveClinic();
            if (clinic && elements.sidebarClinic) {
                elements.sidebarClinic.innerHTML = `
                    <small> </small>
                    <span title="${clinic.name}">${clinic.name}</span>
                `;
                elements.sidebarClinic.classList.remove('hidden');
            }
        } else {
            if (elements.sidebarClinic) elements.sidebarClinic.classList.add('hidden');
        }
    };

    const init = async () => {
        try {
            console.log("HoraClinica: Inicializando sistema...");
            // Map elements
            elements = {
                app: document.getElementById('app'),
                menuToggleBtn: document.getElementById('menuToggleBtn'),
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
                logoutBtn: document.getElementById('logoutBtn'),
                sidebarClinic: document.getElementById('sidebarClinic'),
                zoomOut: document.getElementById('zoomOut'),
                zoomIn: document.getElementById('zoomIn'),
                agendaSearchContainer: document.getElementById('agendaSearchContainer'),
                agendaPatientSearch: document.getElementById('agendaPatientSearch')
            };

            // 1. Detect Clinic from URL immediately
            const urlParams = new URLSearchParams(window.location.search || window.location.hash.substring(window.location.hash.indexOf('?')));
            const urlClinicId = urlParams.get('clinic');
            if (urlClinicId) {
                state.currentClinicId = urlClinicId;
                const cached = getClinicCache(urlClinicId);
                if (cached) upsertClinicInState(cached);
            }

            // 2. Firebase check
            if (typeof db === 'undefined') {
                console.error("Firebase: Banco de dados não detectado. Verifique sua conexão.");
                hideLoadingScreen();
                renderLandingPage();
                return;
            }

            // 3. Listeners imediatos; migração local em segundo plano (não bloqueia a UI)
            setupListeners();
            migrateToFirebase().catch(err => console.error('Migração local:', err));

            // Event Listeners
            elements.navLinks.forEach(link => {
                link.onclick = () => switchView(link.dataset.view);
            });

            // Hamburger menu mobile toggle
            if (elements.menuToggleBtn) {
                elements.menuToggleBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    elements.app.classList.toggle('sidebar-open');
                });
            }

            // Close sidebar when clicking main content area
            const mainContentEl = document.querySelector('.content');
            if (mainContentEl) {
                mainContentEl.addEventListener('click', (e) => {
                    if (elements.app.classList.contains('sidebar-open')) {
                        elements.app.classList.remove('sidebar-open');
                    }
                });
            }

            elements.prevDay.onclick = () => {
                const isWeekView = state.currentView === 'agenda' &&
                    (state.currentUser.role === 'professional' || elements.professionalFilter.value !== 'all');
                state.currentDate.setDate(state.currentDate.getDate() - (isWeekView ? 7 : 1));
                renderView();
            };

            elements.nextDay.onclick = () => {
                const isWeekView = state.currentView === 'agenda' &&
                    (state.currentUser.role === 'professional' || elements.professionalFilter.value !== 'all');
                state.currentDate.setDate(state.currentDate.getDate() + (isWeekView ? 7 : 1));
                renderView();
            };

            elements.todayBtn.onclick = () => {
                state.currentDate = new Date(new Date().setHours(0, 0, 0, 0));
                renderView();
            };

            elements.hiddenDatePicker.onchange = (e) => {
                if (e.target.value) {
                    const [y, m, d] = e.target.value.split('-').map(Number);
                    state.currentDate = new Date(y, m - 1, d);
                    renderView();
                }
            };

            // Allow clicking the date display area to open the picker
            const dateWrapper = document.querySelector('.date-input-wrapper');
            if (dateWrapper) {
                dateWrapper.onclick = () => {
                    if (typeof elements.hiddenDatePicker.showPicker === 'function') {
                        elements.hiddenDatePicker.showPicker();
                    } else {
                        elements.hiddenDatePicker.click();
                    }
                };
            }

            elements.professionalFilter.onchange = () => renderView();

            elements.agendaPatientSearch.oninput = (e) => {
                state.agendaSearch = e.target.value;
                renderAgenda(); // Render grid only to avoid losing focus if we call renderView
            };

            if (elements.zoomOut) {
                elements.zoomOut.onclick = () => {
                    state.columnWidth = Math.max(80, state.columnWidth - 10);
                    document.documentElement.style.setProperty('--col-width', `${state.columnWidth}px`);
                };
            }

            if (elements.zoomIn) {
                elements.zoomIn.onclick = () => {
                    state.columnWidth = Math.min(300, state.columnWidth + 10);
                    document.documentElement.style.setProperty('--col-width', `${state.columnWidth}px`);
                };
            }

            elements.addAppointmentBtn.onclick = () => openNewAppointmentModal();
            elements.closeModal.onclick = () => elements.modalOverlay.classList.add('hidden');
            elements.logoutBtn.onclick = () => {
                state.currentUser = null;
                setupListeners();
                renderLoginScreen();
            };

            if (!state.currentUser) {
                renderLoginScreen();
            } else {
                hideLoadingScreen();
                elements.app.classList.remove('hidden');
                document.getElementById('landingPage').classList.add('hidden');
                updateUserUI();
                populateProfFilter();
                renderView();
            }
        } catch (error) {
            console.error("Erro crítico na inicialização:", error);
            hideLoadingScreen();
            // Show landing page as fallback if everything crashes
            document.getElementById('landingPage').classList.remove('hidden');
        }
    };

    // Run on Load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
