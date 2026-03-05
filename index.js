const {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionsBitField
} = require('discord.js')

const fs = require('fs')

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages
  ]
})

const TOKEN = process.env.TOKEN

// --- BANCOS DE DADOS ---
let pontos = {}
let configs = {}

try { pontos = JSON.parse(fs.readFileSync("pontos.json")) } catch { pontos = {} }
try { configs = JSON.parse(fs.readFileSync("configs.json")) } catch { configs = {} }

function salvarPontos() { fs.writeFileSync("pontos.json", JSON.stringify(pontos, null, 2)) }
function salvarConfigs() { fs.writeFileSync("configs.json", JSON.stringify(configs, null, 2)) }

function formatarTempo(ms) {
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return `${h}h ${m}m`
}

// --- FUNÇÕES DE ATUALIZAÇÃO ---
async function atualizarRanking(guild) {
  const config = configs[guild.id]
  if (!config || !config.CANAL_RANKING) return

  try {
    const canal = await guild.channels.fetch(config.CANAL_RANKING)
    if (!canal) return

    const serverPontos = pontos[guild.id] || {}
    let lista = Object.entries(serverPontos)
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 10)

    let texto = lista.length === 0 ? ">>> 🏜️ *Nenhum registro de horas ainda.*" : ""
    const medalhas = ["🥇", "🥈", "🥉"]

    for (let i = 0; i < lista.length; i++) {
      const userId = lista[i][0]
      const p = lista[i][1]
      const nome = p.nome || "Mecânico Desconhecido"
      const icone = medalhas[i] || "🏅"
      
      texto += `${icone} **${i + 1}º** — **${nome}**\n└ ⏱ \`${formatarTempo(p.total)}\`\n\n`
    }

    const embed = new EmbedBuilder()
      .setTitle("🏆 | RANKING DA MECÂNICA")
      .setDescription(`*Os mecânicos mais dedicados da cidade!*\n\n${texto}`)
      .setColor("#FFD700")
      .setThumbnail(guild.iconURL({ dynamic: true }))
      .setFooter({ text: "Atualizado em tempo real", iconURL: client.user.displayAvatarURL() })
      .setTimestamp()

    const msgs = await canal.messages.fetch({ limit: 10 })
    const antiga = msgs.find(m => m.author.id === client.user.id && m.embeds[0]?.title?.includes("RANKING"))

    if (antiga) await antiga.edit({ embeds: [embed] })
    else await canal.send({ embeds: [embed] })
  } catch (error) {
    console.log(`Erro ao atualizar ranking no servidor ${guild.name}`)
  }
}

async function atualizarPainelAdmin(guild) {
  const config = configs[guild.id]
  if (!config || !config.CANAL_ADMIN) return

  try {
    const canal = await guild.channels.fetch(config.CANAL_ADMIN)
    if (!canal) return

    let textoServico = ""
    const agora = Date.now()
    let opcoesSelect = []
    const serverPontos = pontos[guild.id] || {}

    for (const [userId, p] of Object.entries(serverPontos)) {
      const nome = p.nome || "Mecânico"

      if (p.ativo) {
        const tempo = agora - p.inicio - p.pausas
        const inicioTempo = `<t:${Math.floor(p.inicio / 1000)}:t>`
        const status = p.pausado ? "🟡 *Pausado*" : "🟢 *Trabalhando*"
        
        textoServico += `👤 **${nome}**\n└ Status: ${status} | Início: ${inicioTempo} | Atual: \`${formatarTempo(tempo)}\`\n\n`
      }

      if (opcoesSelect.length < 25) {
        opcoesSelect.push(
          new StringSelectMenuOptionBuilder()
            .setLabel(nome)
            .setDescription(`Total: ${formatarTempo(p.total)}`)
            .setValue(userId)
            .setEmoji(p.ativo ? (p.pausado ? '🟡' : '🟢') : '🔴')
        )
      }
    }

    if (textoServico === "") textoServico = ">>> 💤 *Nenhum mecânico em serviço no momento.*"

    const embed = new EmbedBuilder()
      .setTitle("🛠️ | PAINEL DE ADMINISTRAÇÃO")
      .setDescription(`**Mecânicos em serviço agora:**\n\n${textoServico}`)
      .setColor("#2B2D31")
      .setFooter({ text: "Use o menu abaixo para gerenciar a equipe" })

    let components = []

    if (opcoesSelect.length > 0) {
      const select = new StringSelectMenuBuilder()
        .setCustomId('admin_select_user')
        .setPlaceholder('🔧 Selecione um mecânico...')
        .addOptions(opcoesSelect)
      components.push(new ActionRowBuilder().addComponents(select))
    }

    const botoesGlobais = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("stats_global").setLabel("Estatísticas").setStyle(ButtonStyle.Secondary).setEmoji("📊"),
      new ButtonBuilder().setCustomId("reset_global").setLabel("Resetar Dados").setStyle(ButtonStyle.Danger).setEmoji("⚠️")
    )
    components.push(botoesGlobais)

    const msgs = await canal.messages.fetch({ limit: 10 })
    const antiga = msgs.find(m => m.author.id === client.user.id && m.embeds[0]?.title?.includes("ADMINISTRAÇÃO"))

    if (antiga) {
      await antiga.edit({ embeds: [embed], components })
    } else {
      await canal.send({ embeds: [embed], components })
    }
  } catch (error) {
    console.log(`Erro ao atualizar painel admin no servidor ${guild.name}`)
  }
}

// --- INICIALIZAÇÃO ---
client.once("ready", async () => {
  console.log(`✅ Bot online como ${client.user.tag}`)

  // Registra os Slash Commands globais para os servidores configurarem
  await client.application.commands.set([
    {
      name: 'setup',
      description: 'Abre o painel de configuração de IDs do servidor (Modais)'
    },
    {
      name: 'painel',
      description: 'Envia o painel de "Bater Ponto" no canal configurado'
    }
  ])

  // Atualiza os painéis admin de todos os servidores a cada minuto
  setInterval(() => {
    client.guilds.cache.forEach(guild => {
      atualizarPainelAdmin(guild)
      atualizarRanking(guild)
    })
  }, 60000)
})

// --- EVENTOS DE INTERAÇÃO ---
client.on("interactionCreate", async interaction => {
  const { member, guild, user, customId } = interaction

  // Inicializa a pontuação do servidor se não existir
  if (!pontos[guild.id]) pontos[guild.id] = {}
  const serverPontos = pontos[guild.id]
  const config = configs[guild.id] || {}

  // ==========================================
  // 1. SLASH COMMANDS (/setup e /painel)
  // ==========================================
  if (interaction.isChatInputCommand()) {
    if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.reply({ content: "❌ Apenas administradores podem usar isso.", ephemeral: true })
    }

    if (interaction.commandName === 'setup') {
      const embed = new EmbedBuilder()
        .setTitle("⚙️ Setup da Mecânica")
        .setDescription("Devido ao limite do Discord de 5 campos por janela modal, dividimos a configuração. Clique nos botões abaixo e cole os IDs das salas e cargos.")
        .setColor("#3498DB")

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("setup_canais").setLabel("Configurar Canais").setStyle(ButtonStyle.Primary).setEmoji("📁"),
        new ButtonBuilder().setCustomId("setup_cargos").setLabel("Configurar Cargos").setStyle(ButtonStyle.Secondary).setEmoji("👥")
      )

      return interaction.reply({ embeds: [embed], components: [row], ephemeral: true })
    }

    if (interaction.commandName === 'painel') {
      if (!config.CANAL_PAINEL) return interaction.reply({ content: "❌ O **Canal do Painel** não foi configurado no `/setup` ainda.", ephemeral: true })
      
      try {
        const canalPainel = await guild.channels.fetch(config.CANAL_PAINEL)
        const embed = new EmbedBuilder()
          .setTitle("🔧 | BATER PONTO — MECÂNICA")
          .setDescription(">>> Utilize os botões abaixo para gerenciar o seu turno de trabalho. Lembre-se de finalizar ao sair da cidade!")
          .setColor("#E67E22")
          .setImage("https://i.imgur.com/8Q5Z2gA.png")
          .setFooter({ text: "Sistema Integrado" })

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId("iniciar").setLabel("Iniciar").setStyle(ButtonStyle.Success).setEmoji("🟢"),
          new ButtonBuilder().setCustomId("pausar").setLabel("Pausar").setStyle(ButtonStyle.Secondary).setEmoji("⏸️"),
          new ButtonBuilder().setCustomId("retomar").setLabel("Retomar").setStyle(ButtonStyle.Primary).setEmoji("▶️"),
          new ButtonBuilder().setCustomId("finalizar").setLabel("Finalizar").setStyle(ButtonStyle.Danger).setEmoji("🔴")
        )

        await canalPainel.send({ embeds: [embed], components: [row] })
        return interaction.reply({ content: `✅ Painel enviado com sucesso no canal <#${config.CANAL_PAINEL}>!`, ephemeral: true })
      } catch (e) {
        return interaction.reply({ content: "❌ Erro ao enviar. Verifique se o ID do canal está correto e se o bot tem permissão de falar lá.", ephemeral: true })
      }
    }
  }

  // ==========================================
  // 2. ABRIR MODAIS DE SETUP
  // ==========================================
  if (interaction.isButton() && customId.startsWith("setup_")) {
    if (customId === "setup_canais") {
      const modal = new ModalBuilder().setCustomId('modal_configs_canais').setTitle('Configurar Canais (IDs)')
      
      const inputAdmin = new TextInputBuilder().setCustomId('CANAL_ADMIN').setLabel("ID do Canal Admin").setStyle(TextInputStyle.Short).setRequired(true).setValue(config.CANAL_ADMIN || "")
      const inputPainel = new TextInputBuilder().setCustomId('CANAL_PAINEL').setLabel("ID do Canal de Bater Ponto").setStyle(TextInputStyle.Short).setRequired(true).setValue(config.CANAL_PAINEL || "")
      const inputLogs = new TextInputBuilder().setCustomId('CANAL_LOGS').setLabel("ID do Canal de Logs").setStyle(TextInputStyle.Short).setRequired(true).setValue(config.CANAL_LOGS || "")
      const inputRanking = new TextInputBuilder().setCustomId('CANAL_RANKING').setLabel("ID do Canal de Ranking").setStyle(TextInputStyle.Short).setRequired(true).setValue(config.CANAL_RANKING || "")

      modal.addComponents(
        new ActionRowBuilder().addComponents(inputAdmin),
        new ActionRowBuilder().addComponents(inputPainel),
        new ActionRowBuilder().addComponents(inputLogs),
        new ActionRowBuilder().addComponents(inputRanking)
      )
      return interaction.showModal(modal)
    }

    if (customId === "setup_cargos") {
      const modal = new ModalBuilder().setCustomId('modal_configs_cargos').setTitle('Configurar Cargos (IDs)')
      
      const inputCargoAdmin = new TextInputBuilder().setCustomId('CARGO_ADMIN').setLabel("ID do Cargo Admin/Chefe").setStyle(TextInputStyle.Short).setRequired(true).setValue(config.CARGO_ADMIN || "")
      const inputCargoMec = new TextInputBuilder().setCustomId('CARGO_MECANICO').setLabel("ID do Cargo Mecânico").setStyle(TextInputStyle.Short).setRequired(true).setValue(config.CARGO_MECANICO || "")

      modal.addComponents(
        new ActionRowBuilder().addComponents(inputCargoAdmin),
        new ActionRowBuilder().addComponents(inputCargoMec)
      )
      return interaction.showModal(modal)
    }
  }

  // ==========================================
  // 3. SALVAR MODAIS
  // ==========================================
  if (interaction.isModalSubmit()) {
    if (customId === 'modal_configs_canais' || customId === 'modal_configs_cargos') {
      if (!configs[guild.id]) configs[guild.id] = {}
      
      interaction.fields.fields.forEach((field) => {
        configs[guild.id][field.customId] = field.value.trim()
      })
      
      salvarConfigs()
      atualizarPainelAdmin(guild)
      atualizarRanking(guild)
      return interaction.reply({ content: `✅ **Configurações salvas com sucesso!** O bot já vai começar a operar nos canais informados.`, ephemeral: true })
    }

    // Modal de adicionar/remover tempo do admin
    if (customId.startsWith("modal_add") || customId.startsWith("modal_rem")) {
      const alvoId = customId.split("_")[2]
      const minutosStr = interaction.fields.getTextInputValue('input_minutos')
      const minutos = parseInt(minutosStr)

      if (isNaN(minutos) || minutos <= 0) return interaction.reply({ content: "❌ **Erro:** Digite um número válido de minutos.", ephemeral: true })

      const ms = minutos * 60000 

      if (customId.startsWith("modal_add")) {
        serverPontos[alvoId].total += ms
        salvarPontos(); atualizarRanking(guild); atualizarPainelAdmin(guild)
        return interaction.reply({ content: `✅ **Sucesso!** Foi adicionado \`${minutos} minutos\` para o mecânico.`, ephemeral: true })
      }

      if (customId.startsWith("modal_rem")) {
        serverPontos[alvoId].total = Math.max(0, serverPontos[alvoId].total - ms)
        salvarPontos(); atualizarRanking(guild); atualizarPainelAdmin(guild)
        return interaction.reply({ content: `✅ **Sucesso!** Foi removido \`${minutos} minutos\` do mecânico.`, ephemeral: true })
      }
    }
  }

  // ==========================================
  // 4. DROPDOWN DO PAINEL ADMIN
  // ==========================================
  if (interaction.isStringSelectMenu() && customId === 'admin_select_user') {
    if (!config.CARGO_ADMIN || !member.roles.cache.has(config.CARGO_ADMIN)) {
      return interaction.reply({ content: "❌ **Acesso negado.** Apenas a administração pode usar isso.", ephemeral: true })
    }

    const selectedUserId = interaction.values[0]
    const p = serverPontos[selectedUserId]
    const nome = p.nome || "Mecânico Desconhecido"

    let lista = Object.entries(serverPontos).sort((a, b) => b[1].total - a[1].total)
    let posicao = lista.findIndex(x => x[0] === selectedUserId) + 1

    const statusTexto = p.ativo ? (p.pausado ? "🟡 Pausado" : "🟢 Em Serviço") : "🔴 Fora de Serviço"

    const embedInfo = new EmbedBuilder()
      .setTitle(`⚙️ Gerenciando: ${nome}`)
      .setDescription(`<@${selectedUserId}>`)
      .setColor("#9B59B6")
      .addFields(
        { name: "⏱️ Horas Totais", value: `\`${formatarTempo(p.total)}\``, inline: true },
        { name: "🏆 Posição Rank", value: `\`${posicao}º lugar\``, inline: true },
        { name: "📡 Status Atual", value: `**${statusTexto}**`, inline: true }
      )

    const botoesAcao = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`add_time_${selectedUserId}`).setLabel("Add Tempo").setStyle(ButtonStyle.Success).setEmoji("➕"),
      new ButtonBuilder().setCustomId(`rem_time_${selectedUserId}`).setLabel("Rem Tempo").setStyle(ButtonStyle.Danger).setEmoji("➖"),
      new ButtonBuilder().setCustomId(`force_stop_${selectedUserId}`).setLabel("Encerrar Ponto").setStyle(ButtonStyle.Secondary).setEmoji("⛔")
    )

    return interaction.reply({ embeds: [embedInfo], components: [botoesAcao], ephemeral: true })
  }

  // ==========================================
  // 5. BOTÕES DIVERSOS E BATER PONTO
  // ==========================================
  if (interaction.isButton()) {
    
    // -- ADMIN --
    if (customId.startsWith("add_time_")) {
      const alvoId = customId.split("_")[2]
      const modal = new ModalBuilder().setCustomId(`modal_add_${alvoId}`).setTitle("➕ Adicionar Tempo")
      const input = new TextInputBuilder().setCustomId('input_minutos').setLabel("Quantos MINUTOS quer adicionar?").setStyle(TextInputStyle.Short).setRequired(true)
      modal.addComponents(new ActionRowBuilder().addComponents(input))
      return interaction.showModal(modal)
    }

    if (customId.startsWith("rem_time_")) {
      const alvoId = customId.split("_")[2]
      const modal = new ModalBuilder().setCustomId(`modal_rem_${alvoId}`).setTitle("➖ Remover Tempo")
      const input = new TextInputBuilder().setCustomId('input_minutos').setLabel("Quantos MINUTOS quer remover?").setStyle(TextInputStyle.Short).setRequired(true)
      modal.addComponents(new ActionRowBuilder().addComponents(input))
      return interaction.showModal(modal)
    }

    if (customId.startsWith("force_stop_")) {
      await interaction.deferReply({ ephemeral: true })
      const alvoId = customId.split("_")[2]
      const p = serverPontos[alvoId]
      
      if (!p.ativo) return interaction.editReply("❌ Este usuário já está fora de serviço.")
      
      const agora = Date.now()
      let tempo = agora - p.inicio - p.pausas
      p.total += tempo
      p.ativo = false; p.inicio = null; p.pausado = false; p.pausas = 0
      
      salvarPontos(); atualizarRanking(guild); atualizarPainelAdmin(guild)
      return interaction.editReply("⛔ **Ponto encerrado** forçadamente pela administração.")
    }

    if (customId === "stats_global") {
      if (!config.CARGO_ADMIN || !member.roles.cache.has(config.CARGO_ADMIN)) return interaction.reply({ content: "❌ Acesso negado.", ephemeral: true })
      await interaction.deferReply({ ephemeral: true });
      try { await guild.members.fetch() } catch (e) {}

      const cargoMecanico = guild.roles.cache.get(config.CARGO_MECANICO);
      const totalMembrosComCargo = cargoMecanico ? cargoMecanico.members.size : 0;
      const emServico = Object.values(serverPontos).filter(p => p.ativo).length

      return interaction.editReply({ 
        content: `📊 **ESTATÍSTICAS DA MECÂNICA:**\n\n👥 Membros contratados: \`${totalMembrosComCargo}\`\n🔧 Em serviço agora: \`${emServico}\`` 
      }).catch(() => {})
    }

    if (customId === "reset_global") {
      if (!config.CARGO_ADMIN || !member.roles.cache.has(config.CARGO_ADMIN)) return interaction.reply({ content: "❌ Acesso negado.", ephemeral: true })
      pontos[guild.id] = {}
      salvarPontos(); atualizarRanking(guild); atualizarPainelAdmin(guild)
      return interaction.reply({ content: "⚠️ **ATENÇÃO:** Todos os registros e o ranking foram resetados!", ephemeral: true })
    }

    // -- BATER PONTO (MECÂNICOS) --
    if (["iniciar", "pausar", "retomar", "finalizar"].includes(customId)) {
      await interaction.deferReply({ ephemeral: true })

      if (!config.CARGO_MECANICO) return interaction.editReply("❌ O sistema não foi configurado pelo dono da cidade ainda.")
      if (!member.roles.cache.has(config.CARGO_MECANICO)) {
        return interaction.editReply("❌ **Acesso negado.** Apenas mecânicos podem bater ponto.")
      }

      if (!serverPontos[user.id]) {
        serverPontos[user.id] = { total: 0, ativo: false, inicio: null, pausado: false, pausaInicio: null, pausas: 0, nome: member.displayName }
      } else {
        serverPontos[user.id].nome = member.displayName 
      }

      const p = serverPontos[user.id]
      const agora = Date.now()

      if (customId === "iniciar") {
        if (p.ativo) return interaction.editReply("⚠️ Você já está com o ponto aberto!")
        p.ativo = true; p.inicio = agora; p.pausas = 0; p.pausado = false
        salvarPontos(); atualizarPainelAdmin(guild)
        return interaction.editReply("🟢 **Ponto iniciado!** Bom trabalho.")
      }

      if (customId === "pausar") {
        if (!p.ativo || p.pausado) return interaction.editReply("⚠️ Não é possível pausar agora.")
        p.pausado = true; p.pausaInicio = agora
        salvarPontos(); atualizarPainelAdmin(guild)
        return interaction.editReply("⏸️ **Pausa iniciada.** Vai tomar um cafézinho!")
      }

      if (customId === "retomar") {
        if (!p.pausado) return interaction.editReply("⚠️ Você não está em pausa.")
        p.pausado = false; p.pausas += agora - p.pausaInicio
        salvarPontos(); atualizarPainelAdmin(guild)
        return interaction.editReply("▶️ **Pausa finalizada.** De volta ao trabalho!")
      }

      if (customId === "finalizar") {
        if (!p.ativo) return interaction.editReply("⚠️ Você precisa iniciar o ponto primeiro.")
        
        let tempo = agora - p.inicio - p.pausas
        p.total += tempo

        const inicioDiscord = `<t:${Math.floor(p.inicio / 1000)}:F>`
        const fimDiscord = `<t:${Math.floor(agora / 1000)}:F>`

        const embedLog = new EmbedBuilder()
          .setTitle("📋 | REGISTRO DE EXPEDIENTE")
          .setColor("#2ECC71")
          .setThumbnail(user.displayAvatarURL({ dynamic: true }))
          .addFields(
            { name: "👤 Mecânico", value: `<@${user.id}> (${p.nome})`, inline: false },
            { name: "🟢 Início do Turno", value: inicioDiscord, inline: true },
            { name: "🔴 Fim do Turno", value: fimDiscord, inline: true },
            { name: "⏱️ Tempo Trabalhado Agora", value: `\`${formatarTempo(tempo)}\``, inline: false },
            { name: "📈 Total Acumulado no Rank", value: `\`${formatarTempo(p.total)}\``, inline: false }
          )
          .setFooter({ text: "Sistema Integrado", iconURL: guild.iconURL() })
          .setTimestamp()

        if (config.CANAL_LOGS) {
          try {
            const canalLogs = await guild.channels.fetch(config.CANAL_LOGS)
            canalLogs.send({ embeds: [embedLog] })
          } catch (e) {}
        }

        p.ativo = false; p.inicio = null; p.pausado = false; p.pausas = 0
        salvarPontos(); atualizarRanking(guild); atualizarPainelAdmin(guild)
        return interaction.editReply("🔴 **Ponto finalizado com sucesso!** O registro foi enviado para as logs.")
      }
    }
  }
})

client.login(TOKEN)
