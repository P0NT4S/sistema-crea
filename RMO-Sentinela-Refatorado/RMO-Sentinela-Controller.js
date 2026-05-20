/* ==========================================================================
   MÓDULO DE CONTROLE (Controller Layer)
   Arquitetura: Mediador MVC
   Responsabilidade: Coordenar a execução do Sentinela. Varre a listagem,
   faz a chamada da API, armazena no modelo de domínio e atualiza a GUI.
   ========================================================================== */

/**
 * @class RmoSentinelaController
 * @description Controlador responsável por gerenciar a rotina automática e manual
 * do Sentinela de RMOs.
 *
 * @example
 * const controller = new RmoSentinelaController(dependencias);
 * controller.inicializar();
 */
class RmoSentinelaController {
    /**
     * @param {Object} dependencias - Injeção das dependências e utilitários.
     * @param {UIFacade} dependencias.UIFactory - Facade da interface gráfica.
     * @param {CoreUtils} dependencias.Utils - Utilitários do sistema e logs.
     * @param {CommBridge} dependencias.CommBridge - Bridge de conexão com a API.
     * @param {string} [dependencias.seletorLinha="table tr"] - Seletor das linhas de tabela.
     */
    constructor(dependencias) {
        if (!dependencias.UIFactory) throw new Error('[RmoSentinelaController] dependencias.UIFactory é obrigatório.');
        if (!dependencias.Utils) throw new Error('[RmoSentinelaController] dependencias.Utils é obrigatório.');
        if (!dependencias.CommBridge) throw new Error('[RmoSentinelaController] dependencias.CommBridge é obrigatório.');

        this._ui = dependencias.UIFactory;
        this._utils = dependencias.Utils;
        this._log = dependencias.Utils.log;

        // Seletor de linha parametrizável para flexibilidade
        this._seletorLinha = dependencias.seletorLinha || 'table tr';

        // Inicializa as camadas internas do contexto
        this._modelo = new RmoSentinelaModel();
        this._servico = new RmoSentinelaService(dependencias.CommBridge, dependencias.Utils);
        this._tabela = new TabelaRmos(dependencias.UIFactory);
        this._botaoFab = new BotaoFab(dependencias.UIFactory, () => this.vigiarTabela());
 
        // Flags de controle de fluxo e concorrência
        this._executando = false;
        this._inicializado = false;
    }

    /**
     * Inicializa a aplicação criando o FAB de sincronização e
     * agendando o início da varredura automática.
     */
    inicializar() {
        if (this._inicializado) return;
        this._inicializado = true;
 
        this._log.primary('Controller', 'Inicializando Sentinela RMO...');
 
        // Cria o Floating Action Button usando a classe BotaoFab
        this._botaoFab.criarBotao();

        // Realiza uma primeira reestilização estética e estrutural na tabela
        this._tabela.reestilizar();
 
        // Varredura automática após o carregamento inicial da página (1.5 segundos)
        setTimeout(() => {
            this._log.info('Controller', 'Iniciando varredura automática de inicialização...');
            this._tabela.reestilizar();
            this.vigiarTabela();
        }, 1500);
    }

    /**
     * Função principal do Sentinela que realiza a varredura das RMOs na tabela,
     * busca as informações no servidor e renderiza o feedback visual.
     * 
     * @returns {Promise<void>}
     */
    async vigiarTabela() {
        // Evita concorrência caso o usuário clique freneticamente no FAB enquanto processa
        if (this._executando) {
            this._log.warning('Varredura', 'Uma varredura já está em andamento. Ignorando...');
            return;
        }
        this._executando = true;
        
        // Ativa o estado de carregamento (ampulheta) no FAB
        this._botaoFab.atualizarDados(true);
 
        this._log.primary('Varredura', 'Coletando IDs das RMOs na tabela...');
 
        try {
            // Garante que a tabela está reestilizada antes de varrer e colorir
            this._tabela.reestilizar();

            // 1. Extração dos IDs do DOM e mapeamento no modelo de domínio
            const encontrouRmos = this._servico.varrerTabela(this._seletorLinha, this._modelo);
 
            if (!encontrouRmos) {
                this._log.warning('Varredura', 'Nenhum ID de RMO válido foi encontrado na tabela.');
                return;
            }
 
            const idsParaConsultar = this._modelo.obterIdsUnicos();
            this._log.info('Varredura', `Identificados ${idsParaConsultar.length} IDs únicos na página. Consultando a API...`);
 
            // 2. Consulta de lote à API Local via Serviço
            const resultados = await this._servico.consultarLoteRmos(idsParaConsultar);
 
            this._log.success('API', `Recebidos ${resultados.length} resultados válidos do servidor.`);
            this._ui.info(`Recebidos ${resultados.length} resultados do servidor.`);
 
            // 3. Atualização do modelo de domínio com os resultados
            resultados.forEach(res => {
                this._modelo.atualizarItem(res.id_rmo, res.status, res.descricao);
            });
 
            // 4. Delegação para a TabelaRmos realizar as atualizações visuais de colorização e tooltips
            const contadorColoridos = this._tabela.atualizar(this._modelo.itens);
            
            // Reaplica a reestilização estética para manter colunas e truncamento consistentes
            this._tabela.reestilizar();
            
            this._log.success('Visual', `Tabela atualizada. Total de RMOs coloridas: ${contadorColoridos}`);
 
            if (contadorColoridos > 0) {
                this._ui.success(`Sentinela: ${contadorColoridos} RMOs sincronizadas!`);
            }
 
        } catch (erro) {
            this._log.error('Controller', 'Erro crítico durante a varredura do sentinela.', erro);
            this._ui.error('Falha ao comunicar com o servidor RMO ou atualizar tabela.');
        } finally {
            // Restaura o estado normal (idle) do FAB e libera a execução
            this._botaoFab.atualizarDados(false);
            this._executando = false;
        }
    }
}
