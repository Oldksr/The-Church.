const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, getVoiceConnection } = require('@discordjs/voice');
const play = require('play-dl');
require('libsodium-wrappers');
require('prism-media');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const queues = new Map();
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
                    console.log(`تم تثبيت البوت في الروم الصوتي للسيرفر: ${guild.name}`);
                }
            }
        } catch (err) {
            console.log('خطأ في الانضمام التلقائي للروم');
        }
    }
});

client.on('messageCreate', async message => {
    if (message.author.bot || !message.guild) return;

    const prefix = '!';
    if (!message.content.startsWith(prefix)) return;

    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const cmd = args.shift().toLowerCase();

    if (cmd === 'play') {
        const voiceChannel = message.member.voice.channel;
        if (!voiceChannel) return message.reply('لازم تدخل روم صوتي عشان تقدر تشغل الموسيقى');

        const query = args.join(' ');
        if (!query) return message.reply('اكتب اسم الاغنية او الرابط يطيب');

        let serverQueue = queues.get(message.guild.id);

        try {
            let songInfo;
            const searched = await play.search(query, { limit: 1 });
            if (!searched.length) return message.reply('ما حصلت شي بهذا الاسم');
            
            songInfo = { 
                title: searched[0].title, 
                url: searched[0].url 
            };

            if (!serverQueue) {
                const queueConstruct = {
                    textChannel: message.channel,
                    voiceChannel: voiceChannel,
                    connection: getVoiceConnection(message.guild.id),
                    songs: [],
                    player: createAudioPlayer(),
                    loop: false
                };

                queues.set(message.guild.id, queueConstruct);
                queueConstruct.songs.push(songInfo);

                try {
                    let connection = queueConstruct.connection;
                    if (!connection) {
                        connection = joinVoiceChannel({
                            channelId: voiceChannel.id,
                            guildId: message.guild.id,
                            adapterCreator: message.guild.voiceAdapterCreator,
                            selfDeaf: false
                        });
                        queueConstruct.connection = connection;
                    }
                    playSong(message.guild.id, queueConstruct.songs[0]);
                    message.reply(`تم البدء بتشغيل: ${songInfo.title}`);
                } catch (err) {
                    queues.delete(message.guild.id);
                    return message.reply('صار خطأ وانا اخوك ما قدر يشغل الصوت');
                }
            } else {
                serverQueue.songs.push(songInfo);
                return message.reply(`تمت اضافة لقائمة الانتظار: ${songInfo.title}`);
            }
        } catch (error) {
            return message.reply('صار خطأ اثناء معالجة الطلب');
        }
    }

    else if (cmd === 'stop' || cmd === 'توقيف' || cmd === 'وقف') {
        const serverQueue = queues.get(message.guild.id);
        if (!serverQueue) return message.reply('اصلاً مافيه شي شغال عشان اوقفه');

        serverQueue.songs = [];
        serverQueue.player.stop();
        queues.delete(message.guild.id);
        return message.reply('تم توقيف الموسيقى الحالية وبقي البوت ثابت بالروم');
    }

    else if (cmd === 'panel') {
        const serverQueue = queues.get(message.guild.id);
        if (!serverQueue) return message.reply('مافيه شي شغال حاليا');

        const embed = new EmbedBuilder()
            .setTitle('لوحة التحكم الصوتية')
            .setDescription(`الاغنية الحالية: ${serverQueue.songs[0]?.title || 'لا يوجد'}`)
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
            if (!i.member.voice.channel) return i.reply({ content: 'لازم تكون بنفس الروم عشان تستخدم الازرار', flags: 64 });

            if (i.customId === 'pause') {
                serverQueue.player.pause();
                await i.reply({ content: 'تم ايقاف الاغنية مؤقتا', flags: 64 });
            } else if (i.customId === 'resume') {
                serverQueue.player.unpause();
                await i.reply({ content: 'تم استئناف الاغنية', flags: 64 });
            } else if (i.customId === 'skip') {
                serverQueue.player.stop();
                await i.reply({ content: 'تم تخطي الاغنية', flags: 64 });
            } else if (i.customId === 'stop') {
                serverQueue.songs = [];
                serverQueue.player.stop();
                queues.delete(i.guild.id);
                await i.reply({ content: 'تم توقيف الاغنية وبقي البوت ثابت بالروم', flags: 64 });
            } else if (i.customId === 'loop') {
                serverQueue.loop = !serverQueue.loop;
                await i.reply({ content: `وضع التكرار صار ${serverQueue.loop ? 'مفعل' : 'معطل'}`, flags: 64 });
            }
        });
    }
});

async function playSong(guildId, song) {
    const serverQueue = queues.get(guildId);
    if (!song) return;

    try {
        const streamData = await play.stream(song.url);
        const resource = createAudioResource(streamData.stream, { inputType: streamData.type });
        serverQueue.player.play(resource);
        
        let connection = getVoiceConnection(guildId);
        if (connection) {
            connection.subscribe(serverQueue.player);
        }

        serverQueue.player.once(AudioPlayerStatus.Idle, () => {
            if (!serverQueue.loop) serverQueue.songs.shift();
            playSong(guildId, serverQueue.songs[0]);
        });
    } catch (error) {
        serverQueue.songs.shift();
        playSong(guildId, serverQueue.songs[0]);
    }
}

client.login(process.env.TOKEN);
