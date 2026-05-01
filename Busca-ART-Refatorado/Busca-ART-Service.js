/* ==========================================================================
   MÓDULO DE SERVIÇOS (Application / Service Layer)
   Arquitetura: Motor Assíncrono Desacoplado
   ========================================================================== */

/**
 * @class VarredorDeArtsService
 * @description Orquestra os laços de requisição assíncrona baseados em uma Estratégia de Busca injetada. 
 * Não possui conhecimento de interface HTML nem lógicas intrínsecas de validações do negócio.
 */
class VarredorDeArtsService {
    /**
     * @param {Object} commBridge - Acesso ao proxy de rede nativo (CommBridge da lib).
     */
    constructor(commBridge) {
        this._commBridge = commBridge;
        
        // Coleção de Callbacks (Hooks) para a interface/controller escutar passivamente
        this.onStatusMudou = (tipo, mensagem) => {}; // tipo: 'loading', 'success', 'warning', 'error'
        this.onResultadosEncontrados = (resultadosTratados) => {};
        this.onPausadoParaContinuar = (estadoPaginacao) => {};
        this.onFimDaBusca = (mensagem) => {};
    }

    /**
     * Inicia ou retoma a varredura assíncrona injetando o contexto do ciclo.
     * @param {IFiltroBusca} estrategia - Instância injetada que entende como ler os retornos e gerar queries.
     * @param {EstadoPaginacao} estado - Motor de limitação e limites abstrato injetado.
     * @param {string} rmoIdAtual - ID preenchido na macro ou vazio.
     */
    async iniciarAssincrono(estrategia, estado, rmoIdAtual) {
        if (!estrategia || !estado) throw new Error("Dependências vitais ausentes no Motor de Serviço.");

        try {
            while (estado.podeContinuar()) {
                const pag = estado.paginaAtual;
                this.onStatusMudou('loading', `Analisando página ${pag}...`);

                // 1. Delegar a montagem da URL para a Estratégia (com suporte a override para saltos de domínio)
                let url = "";
                if (typeof estrategia.getOverrideUrl === 'function') {
                    url = await estrategia.getOverrideUrl(pag);
                } else {
                    const paramsStr = estrategia.construirQueryParams(pag).toString();
                    url = `${this._commBridge.urlBaseArt}?${paramsStr}`;
                }
                
                let htmlParaProcessar = "";

                // 2. Fetch Primário (Pula se a estratégia retornar 'skip')
                if (url !== 'skip') {
                    const response = await this._commBridge.apiART.fetchAsync(url);
                    htmlParaProcessar = response.responseText;
                }

                if (estado.isCancelado) break; 

                // 3. Processamento Dinâmico
                const resultado = await estrategia.processarPagina(htmlParaProcessar, rmoIdAtual, estado);
                if (estado.isCancelado) break;

                // 4. Sincronizar o Conhecimento Físico da CREA à nossa Paginação
                estado.atualizarMetadados(resultado.metadados.totalPaginas, resultado.metadados.totalOcorrencias);

                if (resultado.metadados.artsNaPagina < 1) {
                    this.onStatusMudou('warning', `Fim dos registros (Página ${pag} reportou 0 ARTS).`);
                    this.onFimDaBusca(`Fim da varredura.`);
                    return;
                }

                // 5. Reportar Hits Válidos e Pausar para Respiro da Tela
                if (resultado.matches.length > 0) {
                    this.onStatusMudou('success', `${resultado.matches.length} ARTs validadas na pág ${pag}!`);
                    this.onResultadosEncontrados(resultado.matches);

                    // Pausa automática após achar hits e repassa controle
                    if (pag >= estado.totalPaginas) {
                        this.onFimDaBusca(``);
                    } else {
                        estado.avancar(); // Pula pra próxima na contagem da memória (resume future state)
                        this.onPausadoParaContinuar(estado);
                    }
                    return; // Rompe o ciclo pois encontrou blocos e delegou a continuação opcional ao usuário
                }

                // 6. Testes de borda se for página vazia para nossos filtros mas que contém lixo de sistema
                if (pag >= estado.totalPaginas) {
                    this.onStatusMudou('success', `Varredura limpa concluída nas ${estado.totalPaginas} páginas.`);
                    this.onFimDaBusca(`Várredura exaurida.`);
                    return;
                }

                estado.avancar();
                
                // Delay Anti-Ban para requests seguidas do motor
                await new Promise(r => setTimeout(r, 600)); 
            }

            // Exaustão do "While" (Três saídas)
            if (estado.isCancelado) {
                this.onFimDaBusca('Busca interrompida pelo usuário.');
                return; 
            }

            if (estado.atingiuLimiteDoCiclo() && estado.paginaAtual <= estado.totalPaginas) {
                this.onStatusMudou('warning', 'Limite de páginas processadas em background atingido.');
                this.onPausadoParaContinuar(estado);
            }

        } catch (error) {
            console.error(error);
            this.onStatusMudou('error', `Erro crítico do motor de varredura: ${error.message}`);
        }
    }
}
