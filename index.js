const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { DisTube } = require('distube');
const { YtDlpPlugin } = require('@distube/yt-dlp');
const { SpotifyPlugin } = require('@distube/spotify');
const { joinVoiceChannel, getVoiceConnection } = require('@discordjs/voice');
require('libsodium-wrappers');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const distube = new DisTube(client, {
    emitNewSongOnly: true,
    leaveOnStop: false,
    leaveOnFinish: false,
    leaveOnEmpty: false,
    plugins: [
        new YtDlpPlugin(),
        new SpotifyPlugin()
    ]
});

const TARGET_VOICE_CHANNEL_ID = '1559549205343768666';

client.once('ready', async () => {
    console.log('sh8al el bot tamam');
    
    for (const guild of client.guilds.cache.values()) {
        try {
            const channel = await guild.channels.fetch(TARGET_VOICE_CHANNEL_ID).catch(() => null);
            if (channel && channel.isVoiceBased()) {
                const existingConnection = getVoiceConnection(guild.id);
                if (!existingConnection) {
                    joinVoiceChannel({
                        channelId: channel.id,
                        guildId: guild.id,
                        adapterCreator: guild.voiceAdapterCreator,
                        selfDeaf: false
                    });
                }
            }
        } catch (err) {}
    }
});

distube.on('playSong', (queue, song) => {
    queue.textChannel?.send(`تم تشغيل ${song.name}`);
});

distube.on('addSong', (queue, song) => {
    queue.textChannel?.send(`تمت اضافة ${song.name} للطابور`);
});

distube.on('error', (channel, error) => {
    if (channel) channel.send('صار خطا في تشغيل الصوت').catch(() => {});
});

client.on('messageCreate', async message => {
    if (message.author.bot || !message.guild) return;

    const prefix = '!';
    if (!message.content.startsWith(prefix)) return;

    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const cmd = args.shift().toLowerCase();

    if (cmd === 'play') {
        const voiceChannel = message.member.voice.channel;
        if (!voiceChannel) return message.reply('ادخل الفويس اول يطيب');
        
        if (voiceChannel.id !== TARGET_VOICE_CHANNEL_ID) {
            return message.reply('البوت مثبت بروم ثاني ادخل معه');
        }

        let query = args.join(' ');
        if (!query) return message.reply('حط رابط او اسم اغنية');

        try {
            await distube.play(voiceChannel, query, {
                textChannel: message.channel,
                member: message.member,
                skip: false
            });
        } catch (error) {
            return message.reply('ما قدرت اشغل الطلب تاكد من الرابط');
        }
    }

    else if (cmd === 'stop' || cmd === 'توقيف' || cmd === 'وقف') {
        try {
            const queue = distube.getQueue(message.guild.id);
            if (!queue) return message.reply('اصلا مافيه شي شغال');
            await distube.stop(message.guild.id);
            return message.reply('تم توقيف الموسيقى والبوت ثابت برومه');
        } catch (e) {
            return message.reply('مافيه شي شغال حاليا');
        }
    }

    else if (cmd === 'panel') {
        const queue = distube.getQueue(message.guild.id);
        if (!queue) return message.reply('مافيه شي شغال حاليا');

        const embed = new EmbedBuilder()
            .setTitle('لوحة التحكم الصوتية')
            .setDescription(`الاغنية الحالية: ${queue.songs[0]?.name || 'لا يوجد'}`)
            .setColor(0xe50914);

        const row1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('pause').setLabel('ايقاف مؤقت').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('resume').setLabel('استئناف').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('skip').setLabel('تخطي').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('stop').setLabel('توقيف').setStyle(ButtonStyle.Secondary)
        );

        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('loop').setLabel('تكرار').setStyle(ButtonStyle.Secondary)
        );

        const panel = await message.channel.send({ embeds: [embed], components: [row1, row2] });
        const collector = panel.createMessageComponentCollector({ time: 300000 });

        collector.on('collect', async i => {
            if (!i.member.voice.channel || i.member.voice.channel.id !== TARGET_VOICE_CHANNEL_ID) {
                return i.reply({ content: 'لازم تكون بنفس روم البوت', flags: 64 });
            }

            const currentQueue = distube.getQueue(i.guild.id);

            if (i.customId === 'pause') {
                if (currentQueue) currentQueue.pause();
                await i.reply({ content: 'تم ايقاف الاغنية مؤقتا', flags: 64 });
            } else if (i.customId === 'resume') {
                if (currentQueue) currentQueue.resume();
                await i.reply({ content: 'تم استئناف الاغنية', flags: 64 });
            } else if (i.customId === 'skip') {
                try {
                    if (currentQueue) await currentQueue.skip();
                    await i.reply({ content: 'تم تخطي الاغنية', flags: 64 });
                } catch (err) {
                    await i.reply({ content: 'مافيه اغاني بعدها', flags: 64 });
                }
            } else if (i.customId === 'stop') {
                if (currentQueue) await distube.stop(i.guild.id);
                await i.reply({ content: 'تم توقيف الاغنية وبقي البوت ثابت', flags: 64 });
            } else if (i.customId === 'loop') {
                const mode = currentQueue ? currentQueue.toggleRepeatMode() : 0;
                await i.reply({ content: `وضع التكرار صار ${mode ? 'شغال' : 'مطفي'}`, flags: 64 });
            }
        });
    }
});

client.login(process.env.TOKEN);
 
