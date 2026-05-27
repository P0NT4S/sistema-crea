/* ==========================================================================
   MÓDULO DE CONTROLE (Controller Layer)
   Arquitetura: Mediador MVC
   Responsabilidade: Orquestrar o ciclo de vida da aplicação. Recebe eventos
   da GUI, delega ao Service e ao Domain, e atualiza a GUI com os resultados.
   Não possui lógica de UI nem de regras de negócio internas.
   ========================================================================== */

/**
 * @class RmoRegistradorController
 * @description Mediador central da aplicação de Registro de RMOs.
 * Instancia e conecta o Model (Domain), a View (GUI) e o Service,
 * mantendo o estado via RmoRegistroModel e roteando os eventos entre as camadas.
 *
 * @example
 * const controller = new RmoRegistradorController(dependencias);
 * controller.inicializar();
 */
class RmoRegistradorController {
    /**
     * @param {Object} dependencias - Injeção das instâncias globais da aplicação.
     * @param {UIFacade}    dependencias.UIFactory   - Biblioteca de UI.
     * @param {CoreUtils}   dependencias.Utils       - Utilitários e logs.
     * @param {CommBridge}  dependencias.CommBridge  - Camada de rede.
     * @param {CreaHelper}  dependencias.creaHelper  - Helper de integração com o CREA.
     */
    constructor(dependencias) {
        this._ui = dependencias.UIFactory;
        this._utils = dependencias.Utils;
        this._log = dependencias.Utils.log;
        this._creaHelper = dependencias.creaHelper;

        // Camada de Serviço: toda comunicação passa por aqui
        this._servico = new RmoRegistradorService(dependencias.CommBridge, dependencias.Utils);

        // Model: fonte única da verdade do estado da aplicação
        this._modelo = new RmoRegistroModel(null);

        // View: instanciada mas não construída (lazy build ao primeiro clique no FAB)
        this._painelUI = new PainelRegistroRmo(this._ui);

        // Registra o hook de submissão do formulário na View
        this._painelUI.onSalvarClicado = (dadosForm) => this._onFormularioSubmetido(dadosForm);
    }

    // ========================================================================
    // PONTO DE ENTRADA (chamado pelo App Entry Point)
    // ========================================================================

    /**
     * Ponto de entrada público. Extrai o ID da RMO, monta o FAB e
     * dispara a consulta silenciosa em background.
     */
    async inicializar() {
        this._log.primary('Controller', 'Inicializando...');

        // 1. Extração do número da RMO da página atual (polling: até 10s aguardando o Angular)
        this._modelo.idRmo = await this._servico.extrairIdRmoDaPagina(this._creaHelper);

        if (!this._modelo.idRmo) {
            this._log.warning('Controller', 'Nenhum ID de RMO encontrado nesta tela. FAB não será exibido.');
            return;
        }

        this._log.success('Controller', `RMO identificada: ${this._modelo.idRmo}`);

        // 2. Injeta o ID visualmente na toolbar do Ionic (comportamento do legado mantido)
        this._creaHelper.rmo.injetarVisualToolbar(this._modelo.idRmo);

        // 3. Cria o FAB de toggle usando o padrão da GUI
        this._painelUI.criarBotaoFab((foiConstruido) => {
            if (!foiConstruido) {
                // Primeira abertura: constrói o painel com o estado atual do model
                this._painelUI.construir(this._modelo);
                // Exibe o status de sincronização no painel recém-construído
                this._painelUI.atualizarStatusSincronizacao(this._modelo.temRegistroPagina, this._modelo.estaSincronizado);
            } else {
                // Aberturas subsequentes: apenas alterna visibilidade
                this._painelUI.toggle();
            }
        });

        // 4. Dispara a consulta background sem bloquear a UI
        this._carregarDadosBackground();
    }

    // ========================================================================
    // HANDLERS DE EVENTOS DA VIEW
    // ========================================================================

    /**
     * Recebe o evento de submissão do formulário enviado pela GUI.
     * Valida via Domain, persiste via Service e atualiza a GUI com o resultado.
     *
     * @param {{ status: string, descricao: string }} dadosForm - Dados brut    /**
     * Recebe o evento de submissão do formulário enviado pela GUI.
     * Injeta e salva na página do CREA em primeiro lugar (evitando bloqueios por rede do Oráculo),
     * e sincroniza em background (assíncrono) com o backend local do Python.
     *
     * @param {{ status: string, descricao: string }} dadosForm - Dados brutos do formulário.
     * @private
     */
    async _onFormularioSubmetido(dadosForm) {
        this._log.primary('Controller', 'Formulário submetido. Processando...', dadosForm);

        // A. Atualiza o model com os dados do formulário
        try {
            this._modelo.status = new StatusRmo(dadosForm.status);
            this._modelo.descricao = dadosForm.descricao;
        } catch (erroValidacao) {
            // StatusRmo jogar exceção se o valor for inválido (não deveria ocorrer via select)
            this._painelUI.atualizarFeedback(erroValidacao.message, 'error');
            return;
        }

        // B. Dupla verificação de segurança via Domain antes de chamar o Service
        if (!this._modelo.estaValido()) {
            this._painelUI.atualizarFeedback('Preencha todos os campos obrigatórios.', 'warning');
            return;
        }

        // C. Bloqueia a UI e exibe feedback de carregamento
        this._painelUI.bloquearForm(true);
        this._painelUI.atualizarFeedback('Salvando registro no CREA...', 'loading');

        try {
            const isArquivamentoAuxiliado = this._utils.configGlobal && this._utils.configGlobal.arquivamentoAuxiliado === true;
            const deveArquivar = isArquivamentoAuxiliado && (this._modelo.status.valor === 'Regular' || this._modelo.status.valor === 'Informações Insuficientes');

            // D. Primeiro salva ou envia no sistema nativo do CREA (operação de cliente rápida)
            if (deveArquivar) {
                this._painelUI.atualizarFeedback('Enviando RMO no sistema...', 'loading');
                await this._servico.enviarEArquivarNaPagina(this._creaHelper, dadosForm.descricao, this._modelo.idRmo);

                this._painelUI.atualizarFeedback('RMO registrada e enviada com sucesso!', 'success');
                this._ui.toast('RMO enviada e pronta para arquivamento!', 'success');
            } else {
                await this._servico.salvarNaPagina(this._creaHelper, dadosForm.descricao);

                this._painelUI.atualizarFeedback('RMO registrada com sucesso!', 'success');
                this._ui.toast('RMO registrada com sucesso!', 'success');
            }
            this._log.success('Controller', 'RMO salva localmente no CREA com sucesso.');

            // E. Sincroniza com o backend local do Python de forma assíncrona (em segundo plano)
            // Isso previne travamentos caso o Oráculo esteja executando buscas longas na API.
            const payload = new PayloadRegistroRmo(this._modelo).serializar();
            this._servico.salvarRmo(payload)
                .then(() => {
                    this._log.success('Controller', 'Payload sincronizado com o backend com êxito.', payload);
                    this._modelo.estaSincronizado = true;
                    this._modelo.temRegistroPagina = true;
                    if (this._painelUI.foiConstruido) {
                        this._painelUI.atualizarStatusSincronizacao(true, true);
                    }
                })
                .catch((erroLocal) => {
                    this._log.error('Controller', 'Falha na sincronização assíncrona com backend local:', erroLocal);
                    this._ui.toast('Sincronização local falhou, mas a RMO foi salva no CREA.', 'warning');
                    this._modelo.estaSincronizado = false;
                    if (this._painelUI.foiConstruido) {
                        this._painelUI.atualizarStatusSincronizacao(this._modelo.temRegistroPagina, false);
                    }
                });

        } catch (erro) {
            // F. Falha: exibe feedback de erro sem fechar o painel
            const mensagemErro = erro.message || 'Erro desconhecido ao salvar. Verifique o console.';
            this._painelUI.atualizarFeedback(mensagemErro, 'error');
            this._ui.toast('Falha ao salvar no CREA. Verifique o console.', 'error');
            this._log.error('Controller', 'Falha ao salvar no CREA.', erro);

        } finally {
            // G. Sempre reativa o formulário ao final (sucesso ou falha)
            this._painelUI.bloquearForm(false);
        }
    }

    // ========================================================================
    // MÉTODOS PRIVADOS (internos ao Controller)
    // ========================================================================

    /**
     * Consulta silenciosa em background para pré-carregar os dados da RMO do backend local
     * e do CREA. Realiza a verificação de sincronismo e pré-preenche a GUI.
     * @private
     */
    async _carregarDadosBackground() {
        try {
            // 1. Consulta dados no backend local
            const dadosApi = await this._servico.consultarRmo(this._modelo.idRmo);
            this._modelo.aplicarDadosApi(dadosApi);

            // 2. Consulta observações da página do CREA
            const obsPagina = await this._servico.obterObservacaoDaPagina(this._creaHelper);
            this._modelo.analisarSincronizacao(obsPagina);

            // 3. Fallback inteligente: se não há dados no backend mas a página do CREA tem
            // a observação do script (marcador §), usa a descrição da página como inicial.
            if (!dadosApi && this._modelo.temRegistroPagina) {
                const obsLimpa = obsPagina.trim();
                const indicePrefixo = obsLimpa.indexOf('§');
                this._modelo.descricao = obsLimpa.substring(indicePrefixo + 1).trim();
                
                // Reavalia sincronização com a descrição atualizada
                this._modelo.analisarSincronizacao(obsPagina);
            }

            if (dadosApi) {
                this._log.success('Controller', `Dados pré-carregados do backend: status="${this._modelo.status.valor}"`);
            } else {
                this._log.info('Controller', 'RMO nova no backend.');
            }

            this._log.info('Controller', `Status de sincronização da RMO: temRegistro=${this._modelo.temRegistroPagina}, sincronizado=${this._modelo.estaSincronizado}`);

            // 4. Se o painel já foi construído, atualiza o status de sincronização na UI
            if (this._painelUI.foiConstruido) {
                this._painelUI.atualizarStatusSincronizacao(this._modelo.temRegistroPagina, this._modelo.estaSincronizado);
            }

        } catch (erro) {
            this._modelo.aplicarDadosApi(null); // Define como RMO nova em caso de erro de rede
            this._modelo.analisarSincronizacao("");
            this._log.error('Controller', 'Falha no carregamento background. Formulário iniciado em modo de inserção.', erro);
        }
    }
}
