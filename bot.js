require('dotenv').config();

// MODULES ----------------------------------------------------------------------------
/** Discord.JS */
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v9');
const { Client, Permissions, Intents, ThreadChannel, DiscordAPIError, MessageEmbed } = require('discord.js');
const client = new Client({ intents: [
    Intents.FLAGS.GUILDS, 
    Intents.FLAGS.GUILD_VOICE_STATES, 
    Intents.FLAGS.GUILD_MEMBERS,
    Intents.FLAGS.GUILD_PRESENCES
] });

/* Node-fetch */
const fetch = require('node-fetch');

/** Chance.JS */
const Chance = require('chance');
const chance = new Chance();



// FILES ------------------------------------------------------------------------------
const config = require('./json/config.json');
const items = require('./json/items.json');
const attributes = require('./json/attributes.json');



// COMMANDS ---------------------------------------------------------------------------
const commands = [
    {   // Help
        name: 'help',
        description: 'Get help on a particular subject',
        options: [
            { 
                name: 'store',
                description: 'Find out how the Bruh United store works',
                type: 1
            }
        ]
    },
    {   // Store
        name: 'store',
        description: 'Open the Bruh United store'
    },
    {   // Trade
        name: 'trade',
        description: 'Trade your items with other players',
        options: [ 
            { type: 4, name: 'price', description: 'The price of your item', required: true }
        ]
    },
    {   // Changelog
        name: 'changelog',
        description: 'See what\'s changed recently'
    }
];

const rest = new REST({ version: '9' }).setToken(process.env.DISCORD_API_KEY);

// SETUP COMMANDS
(async () => { 
    try {
        console.log('Started refreshing application (/) commands.');

        await rest.put(
            Routes.applicationGuildCommands(config.bot.botID, config.bot.guildID),
            { body: commands },
        );

        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error(error);
    }
})();



// ASSISTANT FUNCTIONS -----------------------------------------------------------------
/** Return an error message from the interaction */
async function returnEmbed(interaction, botInfo, title, description, errorCode) { 
    var embed = new MessageEmbed({ 
        title: title,
        description: description,
        color: botInfo.displayColor
    });

    if (errorCode) { embed.footer = { text: `Error ${errorCode}` } }
    interaction.editReply({ embeds: [ embed ] });
}

/** Effectively the same as returnEmbed, but updates a message */
async function updateEmbed(interaction, botInfo, title, description, errorCode) { 
    var embed = new MessageEmbed({ 
        title: title,
        description: description,
        color: botInfo.displayColor
    });

    if (errorCode) { embed.footer = { text: `Error ${errorCode}` } }
    interaction.update({ embeds: [ embed ], components: [] });
}

/** Get a random number between the min & max */
function getRandomArbitrary(min, max) {
    return Math.round(Math.random() * (max - min) + min);
}

/** Capitalise the first letter of a string */
function capitalize(string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
}

/** Normalises a number to at least n digits, prepending with 0s if necessary
 * @param {Number} number - number to normalise.
 * @param {Number} digits - number of digits to normalise, defaults to 2.
 */
function normaliseNumber(number, digits = 2) { 
    // Make a fixed-length number to the number of digits
    // If a number has less digits, it will be padded with zeros

    let string = number.toString();
    let length = string.length;

    if (length < digits) {
        for (let i = 0; i < digits - length; i++) {
            string = '0' + string;
        }
    }

    return string;
}

/** Generates a random item with the provided category 
 * @param {"weapons"|"armour"|"food"|"potions"|"spells"} category the category to generate
*/
async function generateItem(category) { 

    // Get category
    const categoryItems = items[category];
    if (!categoryItems) { console.log('Invalid category provided'); return; }

    // Pick random item
    const item = categoryItems[getRandomArbitrary(0, categoryItems.length - 1)];

    // Pick a random rarity
    const rarityID = getRandomArbitrary(item.rarity.min, item.rarity.max);
    const absRarity = rarityID + 6;
    var response = await fetch(`${serverDomain}attributes/rarity/id/${rarityID}/${passKeySuffix}`);
    if (response.status !== 200) { console.log('An error occurred'); return; }
    const rarity = await response.json();

    // Get the type
    var response = await fetch(`${serverDomain}attributes/type/id/${item.type}/${passKeySuffix}`);
    if (response.status !== 200) { console.log('An error occurred'); return; }
    const type = await response.json();

    // Generate attributes
    const stats = attributes[category];

    // Construct item 
    const itemInfo = { 
        name: item.name,
        price: stats.price * absRarity,
        stackAmount: getRandomArbitrary(stats.stackAmount, type.maxStackAmount),
        description: item.description,
        type: type,
        rarity: rarity,
        attributes: item.stats,
        isSold: false
    }

    // Assemble attributes
    for (const attribute of stats.stats) { 
        itemInfo.attributes.push({
            name: attribute.name,
            value: Math.ceil(attribute.value * (stats.rarityModifier * absRarity))
        });
    }

    return(itemInfo);
}

/** Generates all the values required to create or update the store embed & buttons */
async function generateStore(userInfo, botInfo) { 

    // Get the user's account
    var response = await fetch(`${serverDomain}accounts/${userInfo.id}/${passKeySuffix}`);
    if (response.status === 400) { 
        await returnEmbed(interaction, botInfo, `You don't have a Mingleton RPG account`, 'You can create one with `/account create`.', response.status); return;
    } else if (response.status !== 200) { 
        await returnEmbed(interaction, botInfo, `An error occurred`, null, response.status); return;
    }
    const userAccountInfo = await response.json();

    // Calculate when the store will refresh
    const timeNow = Date.now();
    const msDifference = new Date(storeRefresh - timeNow);

    // Generate embed
    const embed = { 
        title: `Today's Store`,
        color: botInfo.displayColor,
        fields: [],
        footer: { text: `You have ඞ${userAccountInfo.dollars} | Store will refresh in ${normaliseNumber(msDifference.getMinutes())}:${normaliseNumber(msDifference.getSeconds())}`}
    }

    // Generate buttons
    const messageButtons = [];

    var i = 1;
    for (const item of storeItems) { 

        // Assemble field
        let field = {
            name: `**#${normaliseNumber(i, 2)} | ${item.rarity.emojiName} ${item.type.emojiName} ${item.name}**`,
            value: `*${item.description}* \n **ඞ${item.price}**`
        }

        if (item.stackAmount > 1) { field.name += ` **(${item.stackAmount})**`; }
        if (item.isSold) { field.name = '~~' + field.name + '~~'; }

        for (const attribute of item.attributes) { 
            console.log(attribute);
            if (attribute.value < 0) { field.value += ` | ${attribute.value} ${attribute.name}` }
            else { field.value += ` | +${attribute.value} ${attribute.name}` }
        }

        embed.fields.push(field);

        // Generate buttons
        messageButtons.push({
            type: 2, 
            label: `#${normaliseNumber(i, 2)} (ඞ${item.price})`,
            style: 2,
            custom_id: `store_purchase_${i}`,
            disabled: userAccountInfo.dollars < item.price || item.isSold
        });

        i++;
    }

    return ({ 
        embeds: [ embed ],
        components: [ 
            { type: 1, components: messageButtons }
        ]
    });
}



// VARIABLES ---------------------------------------------------------------------------
const isProduction = true;
const serverDomain = isProduction === true ? config.apiServer.productionServerDomain : config.apiServer.devServerDomain;
const passKeySuffix = '?passKey=joe_mama';

var storeItems = []
var storeRefresh = null;



// ASYNC - REFRESH STORE ---------------------------------------------------------------
(async () => {

    /** Generate 5 random items & store them locally. These items will eventually be updated periodically.
     * 2x weapons
     * 1x armour
     * 1x food
     * 1x potion/spell
     */
    // Generate items
    storeItems = [];
    storeItems.push(await generateItem('weapons'));
    storeItems.push(await generateItem('weapons'));
    storeItems.push(await generateItem('armour'));
    storeItems.push(await generateItem('food'));
    storeItems.push(await generateItem(getRandomArbitrary(0, 1) === 1 ? 'potions' : 'spells'));

    var time = Date.now();
    storeRefresh = new Date(time + config.store.refreshMs);

    // Set an interval
    setInterval(async function () {

        storeItems = [];
        storeItems.push(await generateItem('weapons'));
        storeItems.push(await generateItem('weapons'));
        storeItems.push(await generateItem('armour'));
        storeItems.push(await generateItem('food'));
        storeItems.push(await generateItem(getRandomArbitrary(0, 1) === 1 ? 'potions' : 'spells'));

        var time = Date.now();
        storeRefresh = new Date(time + config.store.refreshMs);

    }, config.store.refreshMs);
})();



// CLIENT EVENTS -----------------------------------------------------------------------
client.on('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);

    client.user.setPresence({
        activities: [{ 
            name: 'Bruh United',
            type: 'PLAYING'
        }],
        status: 'online'
    });
});



client.on('interactionCreate', async interaction => {

    // Assemble bot & user information
    const botInfo = { 
        displayColor: interaction.guild.me.displayColor,
    }
    const userInfo = { 
        displayName: interaction.member.displayName,
        id: interaction.member.id,
        guild: interaction.guild,
        isBot: (interaction.member.user.bot)
    }
    console.log('NEW INTERACTION --------------------------------------------------------');

    if (interaction.isCommand()) {              // COMMAND INTERACTIONS
        console.log('COMMAND INTERACTION');
        await interaction.deferReply();

        if (interaction.commandName === 'store') {
            await interaction.editReply(await generateStore(userInfo, botInfo));
        } else if (interaction.commandName === 'trade') { 

            const tradePrice = interaction.options.getInteger('price', false);
            if (!tradePrice) { await returnEmbed(interaction, botInfo, 'Missing required fields!'); return; }
            if (tradePrice < 0) { await returnEmbed(interaction, botInfo, `Yes, I thought of this too 😩`); return; }

            // Get the user's account
            var response = await fetch(`${serverDomain}accounts/${userInfo.id}/${passKeySuffix}`);
            if (response.status === 400) { 
                await returnEmbed(interaction, botInfo, `You don't have a Mingleton RPG account`, 'You can create one with `/account create`.', response.status); return;
            } else if (response.status !== 200) { 
                await returnEmbed(interaction, botInfo, `An error occurred`, null, response.status); return;
            }
            const userAccountInfo = await response.json();

            if (userAccountInfo.inventory.length === 0) { await returnEmbed(interaction, botInfo, `You have no items in your inventory!`, `You need to have something to trade!`); return; }

            // Display an inventory embed
            const embed = { 
                title: 'Choose an item',
                color: botInfo.displayColor,
                description: `Select an item from your inventory to trade for **ඞ${tradePrice}**.`
            }

            const selectOptions = [];
            for (const item of userAccountInfo.inventory) { 
                console.log(item);
                selectOptions.push({
                    emoji: { name: item.type.emojiName },
                    label: item.name,
                    value: item.id,
                    description: capitalize(item.rarity.name) + ' ' + item.type.name
                });
            }

            await interaction.editReply({
                embeds: [ embed ],
                components: [{
                    type: 1, 
                    components: [{
                        type: 3,
                        customId: 'trade_select_item_' + tradePrice,
                        options: selectOptions,
                        placeholder: 'Choose an item...'
                    }]
                }]
            });

        } else if (interaction.commandName === 'help') { 

            const interactionSubCommand = interaction.options.getSubcommand(false);

            // Calculate when the store will refresh
            const timeNow = Date.now();
            const msDifference = new Date(storeRefresh - timeNow);

            if (interactionSubCommand === 'store') {
                const embed = {
                    color: botInfo.displayColor,
                    title: '💈 About the store • Help', 
                    description: `Bruh United is a premium item dealership for the Mingleton RPG.`,
                    fields: [
                        {
                            name: 'How it works',
                            value: 'You can use `/store` to browse the catalogue of 5 items. This catalogue will refresh every hour, so be sure to pick up what you want when you see it! \n',
                            inline: false
                        },
                        {
                            name: 'What\'s in the store?',
                            value: 'Every catalogue is comprised of **2 weapons**, **1 armour**, **1 food item** and **1 potion/spell**. Every item in each category is roughly equivalent (assuming the same rarity)',
                            inline: false
                        },
                        {
                            name: 'How\'s this different from Baunders & Sons?',
                            value: 'Baunders & Sons will feature a far wider selection of items, and each item is far more variable in the stats it may have. Bruh United is designed to sell a smaller, more focused range of generally less-powerful weapons and armour to get the economy started.',
                            inline: false
                        }
                    ],
                    footer: { text: `Store will refresh in ${normaliseNumber(msDifference.getMinutes())}:${normaliseNumber(msDifference.getSeconds())}`}
                }

                await interaction.editReply({ embeds: [ embed ] });

            } 
        } else if (interaction.commandName === 'changelog') { 

            let embeds = [];

            embeds.push({
                color: botInfo.displayColor,
                title: 'Initial Release • 22w01a', 
                description: `The first official release of Bruh United, fitted a basic store & trading features.`,
                fields: [
                    {
                        name: 'Store',
                        value: `Browse a catalogue of premium items!`,
                        inline: false
                    },
                    {
                        name: 'Trading',
                        value: 'Put a price on items you own & earn a profit!',
                        inline: false
                    },
                ],
                footer: { text: 'Released 08/05/2022'}
            });

            await interaction.editReply({ embeds: embeds });
        }

    } else if (interaction.isButton()) {        // BUTTON INTERACTIONS

        console.log('BUTTON INTERACTION');

        if (interaction.customId.includes('store_purchase_')) {     // Item purchase

            // Check if the original user sent this message
            if (interaction.message.interaction.user.id !== userInfo.id) { return; }

            const interactionMessage = interaction.message;
            interaction.deferReply();

            // Extract item
            const itemID = interaction.customId.split('_')[2];
            const item = storeItems[itemID - 1];
            console.log(item);

            // Get the user's account
            var response = await fetch(`${serverDomain}accounts/${userInfo.id}/${passKeySuffix}`);
            if (response.status === 400) { 
                await returnEmbed(interaction, botInfo, `You don't have a Mingleton RPG account`, 'You can create one with `/account create`.', response.status); return;
            } else if (response.status !== 200) { 
                await returnEmbed(interaction, botInfo, `An error occurred`, null, response.status); return;
            }
            const userAccountInfo = await response.json();

            if (userAccountInfo.dollars < item.price) { await returnEmbed(interaction, botInfo, `You don't have enough ඞdollars!`, `You need another ඞ${item.price - userAccountInfo.dollars} to purchase this item`); return; }

            // Generate this item
            var response = await fetch(`${serverDomain}items/create/${passKeySuffix}`, {
                method: 'POST',
                body: JSON.stringify({
                    name: item.name,
                    description: item.description,
                    rarityID: item.rarity.id,
                    typeID: item.type.id,
                    amount: item.stackAmount,
                    ownerID: userInfo.id,
                    attributes: item.attributes
                }),
                headers: { 'Content-Type': 'application/json' }
            });
            if (response.status !== 200) { await returnEmbed(interaction, botInfo, 'Something went wrong', null, response.status); return; }

            // Deduct from account
            var response = await fetch(`${serverDomain}accounts/${userInfo.id}/add-dollars/${0 - item.price}/${passKeySuffix}`, { method: 'POST' });
            if (response.status !== 200) { await returnEmbed(interaction, botInfo, 'Something went wrong', null, response.status); return; }
            const newAccountBalance = await response.json();

            // Mark the item as sold
            item.isSold = true;

            // Refresh the store
            interaction.editReply({ embeds: [{
                title: 'Item purchased!',
                color: botInfo.displayColor,
                description: `You've purchased ${item.rarity.emojiName} ${item.type.emojiName} **${item.name}** for **ඞ${item.price}**.`,
                footer: { text: `Your new account balance is ${newAccountBalance.dollars}` }
            }]});
            await interactionMessage.edit(await generateStore(userInfo, botInfo));
        } else if (interaction.customId.includes('trade_')) {       // Trade items

            if (interaction.customId.includes('trade_retract_')) { 

                // Check if the original user sent this message
                if (interaction.message.interaction && interaction.message.interaction.user.id !== userInfo.id) { return; }

                // Delete the original message
                await interaction.message.delete();

            } else if (interaction.customId.includes('trade_accept_')) {

                // Check that the original user DIDN'T send this
                if (interaction.message.interaction && interaction.message.interaction.user.id === userInfo.id) { return; }

                interaction.deferReply();

                // Extract information
                const itemID = interaction.customId.split('_')[2];
                const tradePrice = interaction.customId.split('_')[3];

                // Get the user's account
                var response = await fetch(`${serverDomain}accounts/${userInfo.id}/${passKeySuffix}`);
                if (response.status === 400) { 
                    await returnEmbed(interaction, botInfo, `You don't have a Mingleton RPG account`, 'You can create one with `/account create`.', response.status); return;
                } else if (response.status !== 200) { 
                    await returnEmbed(interaction, botInfo, `An error occurred`, null, response.status); return;
                }
                const userAccountInfo = await response.json();

                // Get information about that item group
                var response = await fetch(`${serverDomain}items/${itemID}/true/${passKeySuffix}`);
                if (response.status === 404) { 
                    await returnEmbed(interaction, botInfo, `This item doesn't exist`, response.status); return;
                } else if (response.status !== 200) { 
                    await returnEmbed(interaction, botInfo, `An error occurred`, null, response.status); return;
                }
                const itemStackInfo = (await response.json())[0];

                // Check if they have enough money
                if (userAccountInfo.dollars < tradePrice) { await returnEmbed(interaction, botInfo, `You don't have enough ඞ dollars!`, `You need another **ඞ${tradePrice - userAccountInfo.dollars}** to make that trade.`); return; }

                // Transfer the item
                var response = await fetch(`${serverDomain}items/${itemID}/transfer/${userInfo.id}/true/${passKeySuffix}`, { method: 'POST' });
                if (response.status !== 200) { 
                    await returnEmbed(interaction, botInfo, `An error occurred`, null, response.status); return;
                }

                // Take dollars from the receiver
                var response = await fetch(`${serverDomain}accounts/${userInfo.id}/add-dollars/${0 - tradePrice}/${passKeySuffix}`, { method: 'POST' });
                if (response.status !== 200) { 
                    await returnEmbed(interaction, botInfo, `An error occurred`, null, response.status); return;
                }

                // Give to the owner
                var response = await fetch(`${serverDomain}accounts/${itemStackInfo.ownerID}/add-dollars/${tradePrice}/${passKeySuffix}`, { method: 'POST' });
                if (response.status !== 200) { 
                    await returnEmbed(interaction, botInfo, `An error occurred`, null, response.status); return;
                }

                // Assemble the embed
                const sellerMemberInfo = await userInfo.guild.members.fetch(itemStackInfo.ownerID);
                const embed = {
                    title: `@${userInfo.displayName} purchased ${itemStackInfo.amount} ${itemStackInfo.type.emojiName} *${itemStackInfo.name}*`,
                    color: botInfo.displayColor,
                    description: `${itemStackInfo.rarity.emojiName} Purchased from **@${sellerMemberInfo.displayName}** for **ඞ${tradePrice}**.`
                }

                interaction.editReply({ embeds: [ embed ]});

                // Delete the original message
                await interaction.message.delete();

                // DM the seller
                const dmChannel = await sellerMemberInfo.createDM();
                await dmChannel.send({ 
                    embeds: [ embed ]
                });
            }
        }

    } else if (interaction.isMessageComponent()) { // MESSAGE COMPONENT INTERACTIONS

        console.log('MESSAGE COMPONENT INTERACTION');

        if (interaction.customId.includes('trade_select_item_')) {

            // Check if the original user sent this message
            if (interaction.message.interaction.user.id !== userInfo.id) { return; }

            const interactionMessage = interaction.message;
            interaction.deferUpdate();

            // Extract tradeprice
            const tradePrice = interaction.customId.split('_')[3];

            // Get the user's account
            var response = await fetch(`${serverDomain}accounts/${userInfo.id}/${passKeySuffix}`);
            if (response.status === 400) { 
                await returnEmbed(interaction, botInfo, `You don't have a Mingleton RPG account`, 'You can create one with `/account create`.', response.status); return;
            } else if (response.status !== 200) { 
                await returnEmbed(interaction, botInfo, `An error occurred`, null, response.status); return;
            }
            const userAccountInfo = await response.json();

            // Find that item
            const selectedItem = userAccountInfo.inventory.find(x => x.id === interaction.values[0]);
            console.log(selectedItem);

            if (!selectedItem) { await returnEmbed(interaction, botInfo, `You no longer own this item`, `It may have been deleted or sold already!`); return; }

            // Create an embed
            let embed = {
                title: `@${userInfo.displayName} is selling ${selectedItem.amount} ${selectedItem.type.emojiName} *${selectedItem.name}*`,
                color: botInfo.displayColor,
                description: `${selectedItem.rarity.emojiName} **ඞ${tradePrice}**`
            }

            for (const attribute of selectedItem.attributes) { 
                console.log(attribute);
                if (attribute.value < 0) { embed.description += ` | ${attribute.value} ${attribute.name}` }
                else { embed.description += ` | +${attribute.value} ${attribute.name}` }
            }

            if (selectedItem.description) { embed.description = `*${selectedItem.description}* \n` + embed.description; }

            await interactionMessage.edit({
                embeds: [ embed ],
                components: [{ 
                    type: 1, 
                    components: [
                        {
                            type: 2,
                            customId: `trade_accept_${selectedItem.id}_${tradePrice}`,
                            style: 1,
                            label: `Accept trade (ඞ${tradePrice})`
                        },
                        {
                            type: 2,
                            customId: `trade_retract_${selectedItem.id}`,
                            style: 2,
                            label: `Retract trade (owner only)`
                        },
                    ]
                }]
            });
        }

    } else {                                    // OTHER
        console.log('Interaction of type ' + interaction.type + ' unaccounted for.');
    }
});



// RUN BOT ----------------------------------------------------------------------------
client.login(process.env.DISCORD_API_KEY);