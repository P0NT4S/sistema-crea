// ==UserScript==
// @name         CreaHelper (Domain & Facade)
// @namespace    https://github.com/P0NT4S/
// @version      8.0.0
// @description  Lógica de domínio específica do CREA-DF estruturada em Classes ES6+.
// @author       P0nt4s
// ==/UserScript==

/**
 * @class ArtParser
 * @description Especializada em fazer parsing do HTML legado do CREA-DF.
 * O sistema do CREA utiliza tabelas HTML obsoletas em vez de APIs REST. Esta classe atua
 * como um tradutor, transformando o DOM sujo em objetos JSON padronizados.
 */
class ArtParser {
    /**
     * Inicializa o parser com acesso aos utilitários genéricos.
     * @param {CoreUtils} coreUtils - Instância do núcleo genérico (Logger, TextFormatter).
     */
    constructor(coreUtils) {
        this.core = coreUtils;
    }

    // ========================================================================
    // MÉTODOS PRIVADOS DE PARSING (Helpers Internos)
    // ========================================================================

    /**
     * Quebra a string bruta de profissional em um objeto estruturado.
     * O padrão do CREA costuma ser: "REGISTRO - NOME DO PROFISSIONAL - TITULO"
     * @private
     * @param {string} strRaw - Texto bruto extraído da tabela.
     * @returns {Object} { registro, nome, profissao }
     */
    _parseProfissional(strRaw) {
        if (!strRaw || strRaw === "N/A") return { registro: "N/A", nome: "N/A", profissao: "N/A" };
        
        // Divide a string usando o separador padrão do sistema
        const partes = strRaw.split(" - ").map(p => p.trim());
        
        return {
            registro:  partes[0] || "N/A",
            nome:      partes[1] || "N/A",
            // Junta o restante caso a profissão tenha hífens no nome (ex: Eng. Civil - Estruturas)
            profissao: partes.slice(2).join(" - ") || "N/A"
        };
    }

    /**
     * Converte a estrutura HTML (br, tr, p) em quebras de linha reais (\n).
     * Isso é vital porque permite rodar Regex de forma confiável num texto contínuo,
     * ignorando a bagunça de tags do sistema antigo.
     * @private
     * @param {Element} container - Elemento DOM a ser limpo.
     * @returns {string} Texto puro com quebras de linha estruturadas.
     */
    _getTextoComQuebras(container) {
        if (!container) return "";
        let html = container.innerHTML;
        
        // Substitui tags de estrutura por quebras de linha de texto puro
        html = html.replace(/<br\s*\/?>/gi, '\n')
                   .replace(/<\/tr>/gi, '\n')
                   .replace(/<\/p>/gi, '\n')
                   .replace(/<\/div>/gi, '\n');
        
        // Cria um elemento temporário para extrair apenas o texto (sanitização de tags restantes)
        const temp = document.createElement('div');
        temp.innerHTML = html;
        return temp.textContent.replace(/\u00a0/g, ' '); // Remove "Non-breaking spaces"
    }

    /**
     * Utilitário genérico que limpa o HTML e roda uma regex de extração.
     * @private
     * @param {Element} container - Elemento onde buscar.
     * @param {RegExp} regex - Expressão regular (deve conter um grupo de captura).
     * @returns {string} O valor capturado limpo ou vazio.
     */
    _buscaForte(container, regex) {
        if (!container) return "";
        const textoLimpo = this._getTextoComQuebras(container);
        const match = textoLimpo.match(regex);
        return match ? match[1].trim() : "";
    }

    /**
     * Encontra CPFs ou CNPJs no meio de um bloco de texto.
     * @private
     */
    _extrairDocumentoBruto(container) {
        if (!container) return "";
        const match = container.textContent.match(/\d{2,3}\.[\dX]+\.[\dX]+-\d{2}|\d{2}\.[\dX]+\.[\dX]+\/\d{4}-\d{2}/i);
        return match ? match[0] : "";
    }

    // ========================================================================
    // MÉTODOS PÚBLICOS
    // ========================================================================

    /**
     * Extrai os dados essenciais de uma página contendo uma lista de ARTs (Busca geral).
     * @param {string|Document} source - HTML em texto (via fetch) ou objeto Document.
     * @returns {Object} JSON estruturado com { metadados, arts: [] }.
     */
    parseLista(source) {
        try {
            // Se passar o HTML em String, converte para Document DOM para usar querySelector
            const doc = typeof source === 'string' ? new DOMParser().parseFromString(source, 'text/html') : source;
            
            // O CREA renderiza os resultados da busca nessa tabela específica
            const tabelas = doc.querySelectorAll('table.tela_impressao_fixa');
            const resultados = [];

            tabelas.forEach((tbl) => {
                if (tbl.rows.length < 2) return;

                const linkImpressao = tbl.querySelector('a[href*="form_impressao_tos"]');
                const linkConsulta  = tbl.querySelector('a[href*="form_consulta"]');
                
                // Se não tem link de impressão, não é uma ART válida na tabela
                if (!linkImpressao) return;

                const profRaw = tbl.rows[0].cells[2]?.textContent.trim() || "N/A";
                let proprietario = "N/A", endereco = "N/A";
                
                // Varre a tabela procurando a célula de "Endereço da Obra" que contém dados do proprietário e do endereço
                const celulas = Array.from(tbl.querySelectorAll('td'));
                const celulaObra = celulas.find(td => td.textContent.includes("Endereço da Obra/Serviço:"));
                
                if (celulaObra) {
                    // O CREA sempre coloca o nome do proprietário dentro de um <b> nesta mesma célula
                    const tagB = celulaObra.querySelector('b');
                    if (tagB) proprietario = tagB.textContent.trim();

                    // Corta o texto exatamente onde começa o endereço
                    const partes = celulaObra.textContent.split("Endereço da Obra/Serviço:");
                    if (partes.length > 1) endereco = partes[1].trim();
                }

                // Normaliza URLs relativas para absolutas
                const urlBase = 'https://art.creadf.org.br/art1025/publico/';
                
                resultados.push({
                    numeroART: linkImpressao.textContent.trim(),
                    urlImpressao: new URL(linkImpressao.getAttribute('href'), urlBase).href,
                    urlConsulta: linkConsulta ? new URL(linkConsulta.getAttribute('href'), urlBase).href : "",
                    profissional: this._parseProfissional(profRaw),
                    proprietario: proprietario,
                    endereco: endereco,
                    dataRegistro: tbl.rows[0].cells[3]?.textContent.trim() || "",
                    situacao: tbl.rows[0].cells[4]?.textContent.trim() || "N/A"
                });
            });

            // Lógica de Paginação (Busca quantas páginas e ocorrências tem)
            let totalOcorrencias = resultados.length;
            let totalPaginas = 1;
            const pPaginacao = Array.from(doc.querySelectorAll('p')).find(p => p.textContent.match(/Ocorr[êe]ncia/i));

            if (pPaginacao) {
                const matchOcor = pPaginacao.textContent.match(/([\d.]+)\s*Ocorr[êe]ncia/i);
                if (matchOcor) totalOcorrencias = parseInt(matchOcor[1].replace(/\./g, ''), 10);

                const elementosNumericos = Array.from(pPaginacao.querySelectorAll('a, font'));
                const numeros = elementosNumericos.map(el => parseInt(el.textContent.replace(/\D/g, ''), 10)).filter(n => !isNaN(n));
                if (numeros.length > 0) totalPaginas = Math.max(...numeros);
            }

            this.core.log.info("ArtParser", `Extração de Lista concluída: ${resultados.length} ARTs mapeadas.`);
            
            return {
                metadados: { totalOcorrencias, totalPaginas, artsNaPagina: resultados.length },
                arts: resultados
            };

        } catch (error) {
            this.core.log.error("ArtParser", "Falha crítica ao fazer parsing da Lista de ARTs.", error);
            return { arts: [] };
        }
    }

    /**
     * Faz o parsing completo da página de detalhe de uma ART (A página de impressão completa).
     * @param {string|Document} source - HTML em texto ou objeto Document.
     * @returns {Object|null} Objeto super detalhado com todos os metadados da ART.
     */
    parseDetalhe(source) {
        try {
            const doc = typeof source === 'string' ? new DOMParser().parseFromString(source, 'text/html') : source;

            // Mapeamento das Abas estruturais do HTML do CREA
            const secCabecalho = doc.querySelector('#tab_cabecalho');
            const secProfissional = doc.querySelector('#tab_profissional');
            const secContrato = doc.querySelector('#tab_contratos');
            const secObra = doc.querySelector('#tab_dados_obra');
            
            // --- 1. Extração de Endereço (Dentro da seção de obras) ---
            let endereco = { logradouro: "", numero: "", bairro: "", cep: "", complemento: "", cidade: "", uf: "" };
            if (secObra) {
                const tabelaEndereco = secObra.querySelector('hr + table');
                if (tabelaEndereco) {
                    endereco.logradouro = tabelaEndereco.rows[1]?.cells[0]?.textContent.trim() || "";
                    endereco.numero = this._buscaForte(tabelaEndereco, /N[úu]mero\s*:\s*([^\n]+)/i);
                    endereco.bairro = this._buscaForte(tabelaEndereco, /Bairro\s*:\s*([^\n]+)/i);
                    endereco.cep = this._buscaForte(tabelaEndereco, /CEP\s*:\s*([^\n]+)/i);
                    endereco.complemento = this._buscaForte(tabelaEndereco, /Complemento\s*:\s*([^\n]+)/i);
                    
                    const cidadeUF = this._buscaForte(tabelaEndereco, /Cidade\s*:\s*([^\n]+)/i);
                    if (cidadeUF.includes('-')) {
                        const partes = cidadeUF.split('-');
                        endereco.cidade = partes[0].trim();
                        endereco.uf = partes[1].trim();
                    } else {
                        endereco.cidade = cidadeUF;
                    }
                }
            }

            let coords = this._buscaForte(secObra, /Coordenadas\s*Geogr[áa]ficas\s*:\s*([^\n]+)/i);
            if (coords === ",") coords = ""; 

            // --- 2. Extração de Atividades (Tabela dinâmica) ---
            const atividadesAgrupadas = [];
            const tabelaAtiv = doc.querySelector('#tab_atividade_tecnica table');
            
            if (tabelaAtiv && tabelaAtiv.rows.length > 0) {
                let topicoAtual = null;

                Array.from(tabelaAtiv.rows).forEach(row => {
                    const celula0 = row.cells[0]?.textContent.trim() || "";
                    if (celula0.includes("Após a conclusão")) return; // Rodapé de aviso

                    const celula1 = row.cells[1]?.textContent.trim().toLowerCase() || "";

                    // Identifica se a linha é o título do agrupamento (ex: "quantidade")
                    if (celula1 === "quantidade") {
                        topicoAtual = { topico: celula0, itens: [] };
                        atividadesAgrupadas.push(topicoAtual);
                    } 
                    // Se não for título, adiciona como item daquele grupo
                    else if (topicoAtual && celula0 !== "") {
                        // Limpa os '&nbsp;' que o navegador converte para '\u00a0' e faz o trim
                        const descricao = celula0.replace(/\u00a0/g, ' ').trim();
                        const quantidade = row.cells[1]?.textContent.trim() || "";
                        const unidade = row.cells[2]?.textContent.trim() || "";
                        topicoAtual.itens.push({ descricao, quantidade, unidade });
                    }
                });
            }

            // --- 3. Observações Gerais ---
            let observacoes = "";
            const fieldsets = Array.from(doc.querySelectorAll('fieldset'));
            const obsFs = fieldsets.find(fs => fs.querySelector('legend')?.textContent.includes('Observações'));
            if (obsFs) {
                const font = obsFs.querySelector('font#cp, font[id="cp"]');
                observacoes = font ? this._getTextoComQuebras(font).trim() : this._getTextoComQuebras(obsFs).replace(/5\.\s*Observações/i, '').trim();
            }

            const dataMatch = this._getTextoComQuebras(doc.body).match(/Registrada em:\s*(\d{2}\/\d{2}\/\d{4})/i);
            const docContrato = this._extrairDocumentoBruto(secContrato);
            const docObra = this._extrairDocumentoBruto(secObra?.querySelector('#linha_PROPRIETARIO'));

            // --- 4. Empresa Contratada ---
            let empresaContratada = { nome: "", registro: "" };
            if (secProfissional) {
                const textoProf = this._getTextoComQuebras(secProfissional);
                const nomeEmpresa = textoProf.match(/Empresa contratada\s*:\s*([^\n]+)/i);
                if (nomeEmpresa) {
                    empresaContratada.nome = nomeEmpresa[1].trim();
                    const textoAposEmpresa = textoProf.substring(textoProf.indexOf(nomeEmpresa[0]));
                    const regEmpresa = textoAposEmpresa.match(/Registro\s*:\s*([^\n]+)/i);
                    if (regEmpresa) empresaContratada.registro = regEmpresa[1].trim();
                }
            }

            // --- 5. ARTs Relacionadas ---
            const artsRelacionadas = [];
            if (secCabecalho) {
                const fontRel = secCabecalho.querySelector('font[style*="size:10"]');
                if (fontRel) {
                    // Quebra o texto por linhas (br) para ler cada relação individualmente
                    const linhas = fontRel.innerHTML.split(/<br\s*\/?>/i);
                    linhas.forEach(linha => {
                        const limpo = linha.replace(/<[^>]+>/g, '').trim();
                        if (limpo) {
                            // Tenta capturar o padrão "Relacionada a ART 1234567890"
                            const match = limpo.match(/(.+?)\s+[aà]\s+(?:ART\s+)?(\d+)/i);
                            if (match) {
                                artsRelacionadas.push({ relacao: match[1].trim(), numero: match[2].trim() });
                            } else {
                                // Fallback: Captura qualquer número com 10+ dígitos
                                const nums = limpo.match(/\d{10,}/);
                                if (nums) artsRelacionadas.push({ 
                                    relacao: limpo.replace(nums[0], '').replace(/[aà]\s*$/, '').trim(), 
                                    numero: nums[0] 
                                });
                            }
                        }
                    });
                }
            }

            // --- 6. Lógica de Contrato/Código de Obra Pública ---
            let numContrato = this._buscaForte(secContrato, /Contrato\s*:\s*([^\n]+)/i);
            if (!numContrato) {
                numContrato = this._buscaForte(secObra, /C[óo]digo\/Obra\s*p[úu]blica\s*:\s*([^\n]+)/i);
            }

            this.core.log.success("ArtParser", `ART detalhada parseada com sucesso.`);

            // Retorno Consolidado e Organizado
            return {
                numeroART: secCabecalho?.querySelector('font[style*="size:22"]')?.textContent.trim() || "",
                dataRegistro: dataMatch ? dataMatch[1] : "",
                artsRelacionadas: artsRelacionadas,
                
                responsavel: {
                    nome: secProfissional?.querySelector('font#cp b')?.textContent.trim() || "",
                    titulo: this._buscaForte(secProfissional, /T[íi]tulo\s*profissional\s*:\s*([^\n]+)/i),
                    registro: this._buscaForte(secProfissional, /Registro\s*:\s*([^\n]+)/i),
                    empresaContratada: empresaContratada
                },
                
                contrato: {
                    contratante: this._buscaForte(secContrato, /Contratante\s*:\s*([^\n]+)/i),
                    documento: docContrato,
                    documentoLimpo: this.core.text.apenasNumeros(docContrato),
                    numeroContrato: numContrato,
                    artVinculada: this._buscaForte(secContrato, /Vinculada\s*[aà]?\s*ART\s*:\s*([^\n]+)/i),
                    cep: this._buscaForte(secContrato, /CEP\s*:\s*([^\n]+)/i),
                    fone: this._buscaForte(secContrato, /Fone\s*:\s*([^\n]+)/i),
                    email: this._buscaForte(secContrato, /E-?Mail\s*:\s*([^\n]+)/i)
                },
                
                obra: {
                    proprietario: secObra?.querySelector('#linha_PROPRIETARIO font#cp b')?.textContent.trim() || "",
                    documento: docObra,
                    documentoLimpo: this.core.text.apenasNumeros(docObra),
                    fone: this._buscaForte(secObra?.querySelector('#linha_E_MAIL'), /Fone\s*:\s*([^\n]+)/i),
                    email: this._buscaForte(secObra?.querySelector('#linha_E_MAIL'), /E-?Mail\s*:\s*([^\n]+)/i),
                    finalidade: secObra?.querySelector('#linha_CODIGO_DA_FINALIDADE font#cp b')?.textContent.trim() || "",
                    coordenadas: coords,
                    endereco: endereco
                },
                
                atividadesTecnicas: atividadesAgrupadas,
                observacoes: observacoes
            };

        } catch (error) {
            this.core.log.error("ArtParser", "Falha ao processar Detalhes da ART.", error);
            return null;
        }
    }

    /**
     * Varre estruturas profundas buscando a menção a um contrato dentro dos detalhes da ART.
     * Utilizado para validação secundária quando a busca principal ou direta falha, garantindo
     * maior confiabilidade na auditoria de dados cruzados.
     * 
     * @param {Object} detalhes - Objeto padronizado já extraído pelo método `parseDetalhe()`.
     * @param {string} ano - Ano do contrato (4 dígitos) usado como âncora de busca.
     * @param {RegExp} regex - Expressão regular estrita com o número do contrato procurado.
     * @returns {Object} Retorna o status do match e em qual campo o dado foi localizado { match: boolean, foundText: string }
     */
    checkContractDeep(detalhes, ano, regex) {
        // Fallback defensivo caso o objeto detalhes não possua a estrutura esperada
        if (!detalhes || !detalhes.contrato) return { match: false };

        let t1 = detalhes.contrato.numeroContrato || "";
        let t2 = detalhes.observacoes || "";

        /**
         * Lógica interna de checagem.
         * Quebra o texto ao redor do 'ano' e testa se a regex existe nos arredores.
         */
        const checkLogic = (txt) => {
            if (!txt || !txt.includes(ano)) return false;
            const cl = txt.split(ano).join(" ");
            return regex.test(cl);
        };

        if (checkLogic(t1)) return { match: true, foundText: "Campo Contrato" };
        if (checkLogic(t2)) return { match: true, foundText: "Campo Observações" };
        
        return { match: false };
    }
}

/**
 * @class RmoInterceptor
 * @description Ponte de comunicação com a aplicação Angular/Ionic legada.
 * Esta classe injeta lógicas diretamente no framework JavaScript (via `window.ng`)
 * ignorando a manipulação de DOM para preenchimentos, garantindo estabilidade e performance.
 */
class RmoInterceptor {
    /**
     * @param {CoreUtils} coreUtils - Instância do núcleo genérico.
     */
    constructor(coreUtils) {
        this.core = coreUtils;
        this._instanciaCache = null; // Evita buscar a instância do Angular no DOM múltiplas vezes
        
        // Seletores onde o Ionic costuma "pendurar" a instância do componente da RMO
        this.SELETORES_ALVO = ['page-rmo-novo', 'ion-app', 'body'];
        
        // Dicionário de conversão: O Angular usa tudo "flat" (plano), 
        // mas o nosso sistema devolve estruturado por abas lógicas.
        this.MAPA_ABAS = {
            geral: ['id', 'numero', 'solicitacao', 'dataCadastro', 'tipoFiscalizacao', 'modalidades', 'impedimento', 'situacao', 'fase', 'dataInicio', 'rmo_rota', 'rmo_atividade', 'fis_id', 'pon_numero', 'dataEnvio', 'fiscal', 'titulo_profissional'],
            endereco: ['endereco', 'cep', 'numeroEnd', 'complemento', 'cidade', 'uf', 'ra', 'latitude', 'longitude'],
            proprietario: ['proprietarioCorpLink', 'proprietario', 'cpfCnpjNaoLocalizado', 'cpfCnpj', 'bloqueio_ident', 'desbloqueio_end', 'fone', 'email', 'endereco_proprietario_cep', 'endereco_proprietario', 'endereco_proprietario_numero', 'endereco_proprietario_complemento', 'endereco_proprietario_cidade', 'endereco_proprietario_uf'],
            outros: ['quantitativos', 'semNaoConformidades', 'naoConformidades', 'observacoes', 'declarante']
        };
    }

    // ========================================================================
    // MÉTODOS PRIVADOS (Helpers do Framework)
    // ========================================================================

    /**
     * Tenta romper a barreira do Angular para acessar o Controller/Componente por trás do HTML.
     * @private
     */
    _obterInstanciaAngular(elemento) {
        if (!elemento) return null;
        const win = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
        
        // Angular 4+
        if (win.ng && typeof win.ng.getComponent === 'function') return win.ng.getComponent(elemento);
        
        // Angular 2/8+ debug mode
        if (win.ng && typeof win.ng.probe === 'function') {
            const probe = win.ng.probe(elemento);
            if (probe && probe.componentInstance) return probe.componentInstance;
        }
        return null;
    }

    /**
     * Pega o JSON plano do Angular e agrupa nas abas lógicas (Geral, Endereco, etc).
     * @private
     */
    _estruturarDados(raw) {
        if (!raw) return null;
        let estruturado = { geral: {}, endereco: {}, proprietario: {}, envolvidos: raw.envolvidos || [], anexos: raw.anexos || [], outros: {} };
        
        for (let aba in this.MAPA_ABAS) {
            this.MAPA_ABAS[aba].forEach(campo => {
                if (raw[campo] !== undefined) estruturado[aba][campo] = raw[campo];
            });
        }
        return estruturado;
    }

    /**
     * Operação reversa: Pega nossas abas organizadas e desmancha para injetar de volta no Angular.
     * @private
     */
    _achatarDados(payloadEstruturado) {
        let flatRmo = {};
        for (let chave in payloadEstruturado) {
            // Se for um grupo mapeado (ex: 'endereco' com { cep: "123", rua: "a" })
            if (this.MAPA_ABAS[chave] && typeof payloadEstruturado[chave] === 'object') {
                Object.assign(flatRmo, payloadEstruturado[chave]);
            } else {
                // Mantém arrays ou dados não agrupados soltos
                flatRmo[chave] = payloadEstruturado[chave];
            }
        }
        return flatRmo;
    }

    // ========================================================================
    // MÉTODOS PÚBLICOS
    // ========================================================================

    /**
     * Acopla-se ao framework Angular da página atual. Retorna do cache se já estiver conectado.
     * @returns {Object|null} A instância da RMO legada.
     */
    conectar() {
        if (this._instanciaCache) return this._instanciaCache;

        for (const seletor of this.SELETORES_ALVO) {
            const elemento = document.querySelector(seletor);
            if (elemento) {
                const inst = this._obterInstanciaAngular(elemento);
                // Verifica se encontramos o componente de formulário certo
                if (inst && (inst.form || (inst.rmoService && inst.rmoService.form))) {
                    this._instanciaCache = inst;
                    this.core.log.info("RmoInterceptor", "Hack no Angular bem sucedido (Lazy Load).");
                    return this._instanciaCache;
                }
            }
        }
        
        this.core.log.error("RmoInterceptor", "Falha ao localizar a instância do Angular no DOM.");
        return null;
    }

    /**
     * Injeta o ID da RMO visualmente na barra superior do sistema Ionic para facilitar o usuário.
     * Ele tenta injetar de forma recursiva (fallback) porque o Angular desenha a toolbar sob demanda.
     * @param {string} idRmo - Número da RMO extraída.
     * @param {number} [tentativas=0] - Contador interno para não causar loop infinito.
     */
    injetarVisualToolbar(idRmo, tentativas = 0) {
        if (!idRmo) return;

        try {
            const toolbarTitles = document.querySelectorAll('ion-navbar .toolbar-content ion-title .toolbar-title');
            let injetadoComSucesso = false;

            toolbarTitles.forEach(tb => {
                const texto = tb.textContent || "";
                
                if (texto.includes("RMO")) {
                    // Evita duplicar a injeção caso o método seja chamado duas vezes
                    if (tb.querySelector('.rmo-badge-injetado')) {
                        injetadoComSucesso = true;
                        return; 
                    }

                    const span = document.createElement('span');
                    span.className = 'rmo-badge-injetado';
                    span.textContent = ` : ${idRmo}`;
                    
                    tb.appendChild(span);
                    injetadoComSucesso = true;
                }
            });

            // Se o Ionic ainda não desenhou a navbar, tenta de novo 1 segundo depois (Max 10x)
            if (!injetadoComSucesso && tentativas < 10) {
                setTimeout(() => {
                    this.injetarVisualToolbar(idRmo, tentativas + 1);
                }, 1000); 
            }
            
        } catch (e) {
            this.core.log.warning("RmoInterceptor", "Falha não-crítica ao injetar ID visual na toolbar.", e);
        }
    }

    /**
     * Lê todo o formulário atual da RMO invisível.
     * @param {string} [abaNome=null] - Se informado, retorna apenas a aba requisitada (ex: 'endereco').
     * @returns {Object|null} Clone seguro e estruturado dos dados preenchidos.
     */
    getDadosRmo(abaNome = null) {
        const inst = this.conectar();
        if (!inst) return null;

        const formGroup = inst.form || inst.rmoService.form;
        try {
            // Pega o valor nativo do FormGroup legível e serializa para limpar dependências
            const dadosPlanos = JSON.parse(JSON.stringify(formGroup.getRawValue()));
            const dadosEstruturados = this._estruturarDados(dadosPlanos);
            
            return abaNome && dadosEstruturados[abaNome] ? dadosEstruturados[abaNome] : dadosEstruturados;
        } catch (err) {
            this.core.log.error("RmoInterceptor", `Erro ao formatar dados da RMO: ${err.message}`);
            return null;
        }
    }

    /**
     * Preenche automaticamente o formulário do Angular de forma segura e limpa.
     * O Angular é notificado da alteração para redesenhar a tela (Change Detection).
     * @param {Object} payloadRmo - JSON estruturado a ser inserido. Ex: { endereco: { cep: "7000" } }
     * @returns {boolean} Status da injeção.
     */
    setDadosRmo(payloadRmo) {
        const inst = this.conectar();
        if (!inst) return false;

        const formGroup = inst.form || inst.rmoService.form;
        const payloadFinal = this._achatarDados(payloadRmo);

        try {
            formGroup.patchValue(payloadFinal); // O patchValue atualiza apenas os campos passados
            
            // Força o framework a atualizar o visual com os novos dados
            if (inst.changeDetectorRef) inst.changeDetectorRef.detectChanges();
            
            this.core.log.success("RmoInterceptor", "Dados injetados com sucesso no State Angular.");
            return true;
        } catch (err) {
            this.core.log.error("RmoInterceptor", `Falha no patchValue da RMO: ${err.message}`);
            return false;
        }
    }

    /**
     * Simula o clique de "Adicionar Envolvido" e já preenche o formulário interno
     * que acabou de nascer, engatilhando também a busca no sistema do CREA.
     * @param {Object} [dadosEnvolvido=null] - Objeto plano. Ex: { tipo: "Profissional", registro: "123" }
     * @param {string} [buscarPor=null] - Dado que ativa a API interna (ex: registro para profissionais).
     * @returns {boolean}
     */
    adicionarEnvolvido(dadosEnvolvido = null, buscarPor = null) {
        const inst = this.conectar();
        if (!inst) return false;

        const formGroup = inst.form || inst.rmoService.form;
        const arrayEnvolvidos = formGroup.get('envolvidos');

        // Se a lógica do Ionic for modificada no futuro, esse block trava erros catastróficos
        if (!arrayEnvolvidos || typeof inst.rmoService.envolvidoAdicionar !== 'function') {
            this.core.log.error("RmoInterceptor", "Estrutura nativa de 'Envolvidos' não encontrada ou alterada pelo CREA.");
            return false;
        }

        try {
            const novoIndice = arrayEnvolvidos.length;
            
            // 1. Aciona o método nativo que cria o painel na interface
            inst.rmoService.envolvidoAdicionar();
            if (inst.changeDetectorRef) inst.changeDetectorRef.detectChanges();

            // 2. Se temos dados, injetamos no Array apontando especificamente para o índice recém criado
            if (dadosEnvolvido && Object.keys(dadosEnvolvido).length > 0) {
                const controleAlvo = formGroup.get(`envolvidos.${novoIndice}`);
                if (controleAlvo) {
                    controleAlvo.patchValue(dadosEnvolvido);
                    if (inst.changeDetectorRef) inst.changeDetectorRef.detectChanges();
                    
                    // 3. Simula a "lupa" (busca na API) automaticamente
                    if (buscarPor && typeof inst.buscarEntidade === 'function') {
                        // Delay necessário para dar tempo ao DOM de processar o input
                        setTimeout(() => {
                            inst.buscarEntidade({ tipo: 'envolvido', busca: buscarPor, index: novoIndice });
                        }, 100);
                    }

                    this.core.log.success("RmoInterceptor", `Automação de Envolvido injetada no índice [${novoIndice}].`);
                    return true;
                }
                return false;
            }

            this.core.log.info("RmoInterceptor", `Novo Envolvido em branco acionado.`);
            return true;

        } catch (err) {
            this.core.log.error("RmoInterceptor", `Falha ao orquestrar novo Envolvido: ${err.message}`);
            return false;
        }
    }
}

/**
 * @class CreaHelper
 * @description Facade (Fachada) do Domínio do CREA.
 * Fornece o ponto de entrada principal para os scripts finais, ocultando 
 * as complexidades de instanciação e injeção de dependências.
 */
class CreaHelper {
    /**
     * Inicializa a suíte de ferramentas do CREA.
     * @param {CoreUtils} coreUtils - É OBRIGATÓRIO passar a instância do núcleo genérico.
     */
    constructor(coreUtils) {
        if (!coreUtils) throw new Error("[CreaHelper] Erro Fatal: Necessita de uma instância de CoreUtils para funcionar.");
        
        this.core = coreUtils; 
        
        // Instancia os submódulos passando o core (para que eles tenham log/texto)
        this.parser = new ArtParser(coreUtils);
        this.rmo = new RmoInterceptor(coreUtils);
    }
}