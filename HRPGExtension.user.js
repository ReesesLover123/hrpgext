// ==UserScript==
// @name         HeroesRPG Extension
// @namespace    https://github.com/dolioz/hrpgext
// @version      1.8.8
// @description  Improves UI, does not automate gameplay
// @downloadURL  https://github.com/Dolioz/hrpgext/raw/master/HRPGExtension.user.js
// @updateURL    https://github.com/Dolioz/hrpgext/raw/master/HRPGExtension.user.js
// @match        http://www.heroesrpg.com/*
// @match        http://heroesrpg.com/*
// @match        https://www.heroesrpg.com/*
// @match        https://heroesrpg.com/*
// @grant        GM.getValue
// @grant        GM.setValue
// @author       ApDea, Tanar
// ==/UserScript==

// DISCLAIMER: CHANGING THIS SCRIPT TO AUTOMATE GAMEPLAY IS AGAINST THE RULES

hextClanMemberCache = []
let notifSound, cheerfulSound, eerieSound, username, version, lastVersion
let lastChatRow = 0, lastLogRow = 0, isFirstChatMutation = true
let dhInterval = null, boostTime = { double: 0, haste: 0 }
let skillTuples = [
    { ids: [1, 2, 3], ratio: [1, 2.67, 6] },
    { ids: [4, 5, 6], ratio: [1, 2.67, 6] },
    { ids: [7, 8, 9], ratio: [1, 3.33, 7.5] },
    { ids: [10, 11, 12], ratio: [1, 2.67, 6] },
    { ids: [13, 14, 15] },
    { ids: [16, 17, 18], ratio: [1, 1, 1] },
    { ids: [19, 20, 21], ratio: [1, 1, 1] },
    { ids: [22] },
    { ids: [51, 52, 53], ratio: [1, 1, 1] },
    { ids: [54, 55, 56], ratio: [1, 1, 1] },
]
let channels = [], channelBtnContainer, clanChatContainer, clanChat, headerMenuContainer, settingsContainer
let stats = null, currentMatUsage = 0, currentMatActions = 0, currentMatAvg = 0
let startingStats = {
    allTimeMatUsageAvg: 145.42083333333326,
    allTimeMatUsageCount: 1680,
}
let settings = null, defaultSettings = {
    notifyPause: false,
    notifMyGlobal: true,
    notifyPM: true,
    notifRift: true,
    notifTrade: false,
    notifyQuest: true,
    notifyCrafting: true,
    notifySales: true,
    notifClanMessage: false,
    notifClanGlobal: false,

    shortenRiftKill: true,
    hideOthersGlobal: false,
    hideClanMembersGlobal: false,
    markGlobalsRead: true,

    clanChannel: true,
    clanHide: false,

    usernameClick: true,
    urlToLink: true,
    clickableForum: true,

    increaseChat: true,

    startupGathering: false,
    personalDH: false,
    showClanProfile: true,
    compareTiers: false,

    hideHeader: true,
    fixedPopupHeader: true,
    permanentScrollbar: true,

    showPower: true,
    attrBonus: false,
    showQP: true,
    hideBattleQuest: false,
    hideGatherQuest: true,
    quickQuest: true,

    dhTimer: true,
    enterRift: true,

    creditStore: true,
    creditStoreTab: "boosts",

    // log settings
    hideCommonDrops: true,
    hideUncommonDrops: false,
    hideLevelUps: false,
};

(async function () {
    //Init
    if (document.getElementById('login-box') !== null)
        return //You need to login first

    if (document.getElementById('main-stats') === null)
        return //Game window not found

    //Update notification in chat
    version = GM.info.script.version
    lastVersion = await GM.getValue("HExt_lastVersion", '1.0.0')
    if (lastVersion < version) {
        GM.setValue("HExt_lastVersion", version)
        setTimeout(notifyNewVersion, 750) //Notify users about new features after chat is loaded
    }

    //Show version in footer
    document.getElementById('footer').textContent += "  ~~HExt v" + version + "~~"

    //Restore user settings
    settings = await GM.getValue("HExt_settings", defaultSettings)
    stats = await GM.getValue("HExt_stats", startingStats)

    addStyleSheet()
    applyInjections()

    //Notification sounds
    notifSound = document.createElement('audio')
    notifSound.src = "https://bitbucket.org/ttriisa/hrpg-ext/raw/c60c2767bad2f3c09d50eb09abc1c908322cb6d8/misc/basic_notification.mp3"
    notifSound.autoplay = false
    cheerfulSound = document.createElement('audio')
    cheerfulSound.src = "https://bitbucket.org/ttriisa/hrpg-ext/raw/c60c2767bad2f3c09d50eb09abc1c908322cb6d8/misc/cheerful_notification.mp3"
    cheerfulSound.autoplay = false
    eerieSound = document.createElement('audio')
    eerieSound.src = "https://bitbucket.org/ttriisa/hrpg-ext/raw/c60c2767bad2f3c09d50eb09abc1c908322cb6d8/misc/eerie_notification.mp3"
    eerieSound.autoplay = false
    document.body.appendChild(notifSound)
    document.body.appendChild(cheerfulSound)
    document.body.appendChild(eerieSound)

    username = document.querySelector("#s_cname").textContent

    //Prepare channels
    channelBtnContainer = document.getElementById('channels')
    channels.push(document.getElementById('chat1'))
    channels.push(document.getElementById('chat10'))
    channels.push(document.getElementById('chat100'))

    //Clear default channel buttons and add our channels and buttons
    channelBtnContainer.textContent = ""
    createChannelButton(1, "Chat")
    clanChatContainer = createChannel(2, "Clan")
    createChannelButton(10, "Log")
    createChannelButton(100, "Statistics")
    headerMenuContainer = createChannel(3, "Menu")
    settingsContainer = createChannel(4, "Settings")

    prepareSettings()
    createHeaderMenu()
    toggleHeader()
    prepareClanChannel()
    cachePlayerClanId()
    await cacheClanMember()

    if (settings.startupGathering) {
        let select = document.getElementById('center_select')
        if (select !== null) {
            select.selectedIndex = 2
            unsafeWindow.centerSelect()
        }
    }

    //Personal DH confirmation
    let linksInLeft = document.querySelectorAll('#main-stats a')
    for (let i = 0, link; link = linksInLeft[i]; i++) {
        let regex = /javascript:personalDH\((\d+)\)/
        let match = regex.exec(link.href)
        if (match !== null) {
            let dhAmount = parseInt(match[1])

            link.href = "javascript:"
            link.addEventListener("click", (function (e, dh) {
                if (settings.personalDH) {
                    if (confirm("Do you want to activate " + dh + " minutes of personal DH?"))
                        unsafeWindow.personalDH(dh)
                } else {
                    unsafeWindow.personalDH(dh)
                }
            }).bind(this, null, dhAmount))
        }
    }

    //Add extra stats into the left menu
    let table = document.querySelector('#main-stats tbody')

    //Double and haste timer
    let dhTimeTr = document.createElement('tr')
    dhTimeTr.id = "dhtimerow"
    dhTimeTr.innerHTML = '<td colspan="2" style="text-align: center; font-size: 10px" id="dhtime">Checking DH status...</td>'
    dhTimeTr.style.display = settings.dhTimer ? 'table-row' : 'none'
    table.appendChild(dhTimeTr)

    //Static enter rift button
    let enterRift = document.createElement('tr')
    enterRift.id = "enterRift"
    enterRift.innerHTML = '<td></td><td class=".greytext">[<a href="javascript:enterRift()">Enter Rift</a>]</td>'
    enterRift.style.display = settings.enterRift ? 'table-row' : 'none'
    table.appendChild(enterRift)

    let financialHeaderRow = null, questHeaderRow = null
    let leftRows = document.querySelectorAll('#main-stats > table > tbody > tr')
    for (let i = 0, row; row = leftRows[i]; i++) {
        //Enable quick action buttons for quests in left menu
        if (row.textContent.indexOf('Battle:') === 0) {
            row.style.display = settings.hideBattleQuest ? 'none' : 'table-row'
            let tr = document.createElement('tr')
            tr.className = "left-quest-action-battle"
            tr.innerHTML = '<td></td><td class="greytext"><span>[<a href="javascript:questReroll(1)">Re-roll</a>] [<a href="javascript:questReduce(1)">Reduce</a>]</span></td>'
            if (settings.quickQuest && !settings.hideBattleQuest)
                tr.style.display = 'table-row'
            else
                tr.style.display = 'none'
            row.parentNode.insertBefore(tr, row.nextElementSibling)
        } else if (row.textContent.indexOf('Gather:') === 0) {
            row.style.display = settings.hideGatherQuest ? 'none' : 'table-row'
            let tr = document.createElement('tr')
            tr.className = "left-quest-action-gather"
            tr.innerHTML = '<td></td><td class="greytext"><span>[<a href="javascript:questReroll(2)">Re-roll</a>] [<a href="javascript:questReduce(2)">Reduce</a>]</span></td>'
            if (settings.quickQuest && !settings.hideGatherQuest)
                tr.style.display = 'table-row'
            else
                tr.style.display = 'none'
            row.parentNode.insertBefore(tr, row.nextElementSibling)
        } else if (row.textContent.indexOf('Financial') === 0) {
            financialHeaderRow = row
        } else if (row.textContent.indexOf('Quest') === 0) {
            questHeaderRow = row
        }
    }

    //Attributes
    let _attributes = ['a_str', 'a_dex', 'a_sta']
    for (var ai = 0, attr; attr = _attributes[ai]; ai++) {
        let attrElement = document.getElementById(attr)
        if (attrElement !== null) {
            let attrBonus = document.createElement('span')
            attrBonus.className = "attr_bonus g-green smol"
            attrBonus.id = "ext_" + attr + "_bonus"
            attrBonus.style.display = settings.attrBonus ? 'inline-block' : 'none'
            attrElement.parentElement.appendChild(attrBonus)
        }
    }

    if (financialHeaderRow) {
        //Power and armor
        let powerTr = document.createElement('tr')
        let armorTr = document.createElement('tr')
        powerTr.className = "power_row"
        armorTr.className = "power_row" //For hiding with settings
        powerTr.innerHTML = '<tr><td>Power:</td><td id="ext_a_power"></td></tr>'
        armorTr.innerHTML = '<tr><td>Armor:</td><td id="ext_a_armor"></td></tr>'
        powerTr.style.display = settings.showPower ? 'table-row' : 'none'
        armorTr.style.display = settings.showPower ? 'table-row' : 'none'
        table.insertBefore(powerTr, financialHeaderRow)
        table.insertBefore(armorTr, financialHeaderRow)
    }

    //Credit store link
    let creditsSpan = document.getElementById('s_credits')
    if (creditsSpan !== null) {
        unsafeWindow.creditStoreTab = settings.creditStoreTab //Store as global value so I don't have to change link with callback

        let creditStoreLink = document.createElement('span')
        creditStoreLink.className = "cstore_btn greytext padl2"
        creditStoreLink.innerHTML = '[<a href="javascript:creditStore(creditStoreTab)">Store</a>]'
        creditStoreLink.style.display = settings.creditStore ? 'inline-block' : 'none'
        creditsSpan.parentElement.appendChild(creditStoreLink)
    }

    //Quest Points
    if (questHeaderRow) {
        let questPointsTr = document.createElement('tr')
        questPointsTr.className = "qp_row"
        questPointsTr.innerHTML = '<tr><td>Points:</td><td><span id="ext_a_qp"></span><span class="greytext padl2">[<a href="javascript:creditStore(\'qp\')">Store</a>]</span></td></tr>'
        questPointsTr.style.display = settings.dhTimer ? 'table-row' : 'none'
        table.insertBefore(questPointsTr, questHeaderRow.nextElementSibling)
    }

    //Wait a sec for chat to be ready, just to be sure...
    setTimeout(function () {
        if (settings.dhTimer)
            sendCommand('dh')
        if (settings.showPower || settings.attrBonus)
            sendCommand('stats')
        if (settings.showQP)
            unsafeWindow.updateQuestPoints()
    }, 200)

    //Increase chat row limit
    if (settings.increaseChat)
        unsafeWindow.chatsize = 1000

    prepareLogChannel()

    //Prepare chat, sometimes mutation happens before we get observer ready
    let chatRows = document.querySelectorAll('#chat_table1 tr')
    if (chatRows.length > 0) {
        processMainChatRows(chatRows)
        lastChatRow = parseInt(chatRows[0].id.substring(6)) //Mark the first row as the last checked row
        if (isFirstChatMutation)
            isFirstChatMutation = false //Avoid notifications on first load
    }

    //Set up skill tier comparsion
    prepareSkillTrainLinks()

    //Browser will ask permission for showing notifications
    if (Notification.permission !== "denied") {
        Notification.requestPermission()
    }

    //Observe changes on page
    MutationObserver = window.MutationObserver || window.WebKitMutationObserver
    let observer = new MutationObserver(function (mutations, observer) {
        for (let i = 0, mutation; mutation = mutations[i]; i++) {
            //Ignore mutations when we are editing elements
            try {
                if (!mutation.isBeingEdited()) {

                    //When new messages appear in chat
                    if (mutation.target.parentNode.id === "chat_table1") {
                        let chatRows = mutation.target.querySelectorAll('tr')
                        try {
                            processMainChatRows(chatRows)
                        } catch (e) {
                            console.log("Error in function 'processMainChatRows': " + e.message)
                        }
                        lastChatRow = parseInt(chatRows[0].id.substring(6)) //Mark the first row as the last checked row

                        //Avoid notifications on first load
                        if (isFirstChatMutation)
                            isFirstChatMutation = false
                    }

                    //New log rows
                    if (mutation.target.id === "chat_table10" || mutation.target.parentNode.id === "chat_table10") {
                        processLogRows()
                    }

                    //When popup opens
                    if (["popup-content", "skill-popup-content", "equipment-popup-content"].indexOf(mutation.target.id) !== -1) {
                        let popup = mutation.target.parentNode
                        popup.style.display = "block"
                        popup.style.top = ((window.innerHeight - popup.clientHeight) / 2) + "px"
                        popup.style.left = popup.getBoundingClientRect().left + "px"
                        popup.style.position = "fixed"
                    }

                    if (mutation.target.id === "popup-content") {
                        //Make urls in forum threads to clickable
                        if (settings.clickableForum && mutation.target.querySelector('#thread-header')) {
                            mutation.startEdit()
                            mutation.target.innerHTML = mutation.target.innerHTML.replace(
                                /(([a-z]{3,6}:\/\/)|)([a-zA-Z0-9\-]+\.)+[a-z]{2,13}[\.\?\=\&\%\/\w\-]*\b(['\"]?)/gi,
                                function (match, g1, g2, g3, g4) {
                                    //Check if url ends with quotes, then it's probably somewhere in html
                                    //Could use negative lookbehind but it doesn't work in ES6 yet
                                    if (g4 !== '')
                                        return match

                                    let url = match
                                    if (!match.match(/^http/i))
                                        url = "//" + match
                                    return '<a href="' + url + '" target="_blank">' + match + '</a>'
                                }
                            )
                        }

                        let clanSummary = mutation.target.querySelector('a[href="javascript:clanMenu(\'summary\')"]')
                        if (settings.showClanProfile && clanSummary) {
                            let clanProfile = document.createElement('a')
                            clanProfile.href = "javascript:viewClanProfile()"
                            clanProfile.textContent = "Public profile"
                            clanSummary.parentElement.insertBefore(clanProfile, clanSummary)
                            clanSummary.parentElement.insertBefore(document.createElement('br'), clanSummary)
                        }
                    }

                    //Top right section
                    if (mutation.target.id === "tright_content") {
                        //Set up skill tier comparsion
                        prepareSkillTrainLinks(mutation.target)
                    }

                    //Bottom right section
                    if (mutation.target.id === "bright_content") {
                        mutation.startEdit()
                        mutation.target.innerHTML = addGemInfo(mutation.target.innerHTML)
                    }
                    if (mutation.target.id === "equipment-popup-content") {
                        //If popup content has been cleared don't do nothing and wait for the next mutation
                        if (mutation.target.innerHTML === "")
                            return

                        mutation.startEdit()
                        mutation.target.innerHTML = addGemInfo(mutation.target.innerHTML)
                        addGemDropdownColorClass('gemid')
                    }

                    //Predict crafting material cost
                    if (mutation.target.id === "craft_cost_span") {
                        let chanceSpan = document.getElementById("craft_chance_span")
                        const chance = parseFloat(chanceSpan.textContent) / 100

                        const regex = /to level \d+ requires (\d+) consecutive/
                        let match = regex.exec(mutation.target.textContent)
                        if (match !== null) {
                            const triesNeeded = parseInt(match[1])
                            const notHappenFirstTry = 1 - Math.pow(chance, triesNeeded)
                            const steps = [0.05, 0.1, 0.2, 0.4, 0.65]
                            let result = "<br><br>"

                            //Find chance using root solver. Probability is found by looking for how long is it possible to NOT get n consecutive attempts.
                            //There's small problem, equation thinks one try as n attempts, but in game new try starts as soon as first attempt fails, not when all n are finished.
                            //So estimates are bit higher than real, but close. If you know better eq than 1-Math.pow(1-Math.pow(chance, triesNeeded), x) then help me out.
                            //And thank God I found this root solver written in JS and didn't have to translate some pseudocode all night.
                            //My head hurts already from basic probability calc and figuring out how to use root solver to find other answers than 0, well it was ez actually.
                            for (let i = 0; i < steps.length; i++) {
                                let tries = Math.ceil(newtonRaphson(1, 1, 100, 0.001, function (x) { return (1 - Math.pow(notHappenFirstTry, x)) - steps[i] })) * triesNeeded
                                switch (i) {
                                    case 0: result += "<span class='red'>Very unlikely"; break
                                    case 1: result += "<span class='orang'>Unlikely"; break
                                    case 2: result += "<span class='yellow'>Moderately likely"; break
                                    case 3: result += "<span class='g-green'>Likely"; break
                                    case 4: result += "<span class='d-green'>Very likely"; break
                                }
                                if (tries === false) {
                                    result += " to never succeed as calculations failed...</span>"
                                } else {
                                    let time = tries / 3600 //Without DH it does 5 tries every 5 seconds
                                    result += " to success in " + time.toFixed(1) + "h with " + nFormatter(Math.ceil(tries / 5), 1) + " actions.<br>Estimated material need: " + nFormatter(stats.allTimeMatUsageAvg * tries, 1) + "</span><br>"
                                }
                            }
                            mutation.startEdit()
                            mutation.target.innerHTML = mutation.target.innerHTML + result + "<i class='smol greytext'>Time is calculated without DH. 1 action is 5 tries</i>"
                        }
                    }

                    //Main section
                    if (mutation.target.id === "content") {
                        let text = mutation.target.textContent

                        //Collect material usage statistics
                        if (text.match(/You attempt to (toughen|sharpen) a /)) {
                            let regex = /-([\d,]+) (Leather|Metal)/g
                            let match = null
                            while ((match = regex.exec(text)) !== null) {
                                let used = match[1].toInt()
                                addMaterialStat(used)
                            }
                        }

                        //Jewelcrafting gem colors
                        addGemDropdownColorClass('maingemid')

                        //Check for crafting completions
                        if (settings.notifyCrafting) {
                            if (text.indexOf("is toughened to level") !== -1 || text.indexOf("is sharpened to level") !== -1)
                                notify("Crafting to the next level was successful!", "cheerful")
                            if (text.indexOf("You have run out of") != -1)
                                notify("You have run out of material!")
                        }
                    }
                } else {
                    mutation.endEdit()
                }
            } catch (err) {
                console.log("Error in mutation observer: " + err.message)
            }
        }
    })

    observer.observe(document, {
        subtree: true,
        attributes: false,
        childList: true,
        characterData: false,
        attributeOldValue: false,
        characterDataOldValue: false
    })
})();

async function prepareSettings() {
    //Check if settings contain all new options, if not - take default value
    for (let key in defaultSettings) {
        if (defaultSettings.hasOwnProperty(key)) {
            if (typeof settings[key] === "undefined")
                settings[key] = defaultSettings[key]
        }
    }

    //Create HTML elements for settings
    let notifMenu = document.createElement('div')
    notifMenu.className = "settings table-style col-4"
    let notifHeader = document.createElement("div")
    notifHeader.textContent = "Notifications"
    notifHeader.className = "category-header"
    notifMenu.appendChild(notifHeader)
    notifMenu.appendChild(createCheckbox("notifyPause", "Pause all notifications", "setting bold"))
    notifMenu.appendChild(createCheckbox("notifMyGlobal", "Notify my globals with cheerful sound", "setting g-green"))
    notifMenu.appendChild(createCheckbox("notifyPM", "Notify personal messages", "setting red"))
    notifMenu.appendChild(createCheckbox("notifRift", "Notify rift opening", "setting purple"))
    notifMenu.appendChild(createCheckbox("notifTrade", "Notify trade chat", "setting d-green"))
    notifMenu.appendChild(createCheckbox("notifClanMessage", "Notify clan messages", "setting yellow"))
    notifMenu.appendChild(createCheckbox("notifClanGlobal", "Notify clan globals", "setting yellow"))
    notifMenu.appendChild(createCheckbox("notifyQuest", "Notify quest completion", "setting"))
    notifMenu.appendChild(createCheckbox("notifyCrafting", "Notify crafting finish & mat. shortage", "setting"))
    notifMenu.appendChild(createCheckbox("notifySales", "Notify items sold on market", "setting"))
    notifMenu.appendChild(document.createElement('br'))
    settingsContainer.appendChild(notifMenu)

    let chatMenu = document.createElement('div')
    chatMenu.className = "settings table-style col-4"
    let chatHeader = document.createElement("div")
    chatHeader.textContent = "Chat"
    chatHeader.className = "category-header"
    chatMenu.appendChild(chatHeader)
    chatMenu.appendChild(createCheckbox("shortenRiftKill", "Shorten rift kill globals", "setting g-green"))
    chatMenu.appendChild(createCheckbox("hideOthersGlobal", "Hide most non clan member globals", "setting g-green", refreshChatVisibility))
    chatMenu.appendChild(createCheckbox("hideClanMembersGlobal", "Hide most clan member globals", "setting g-green", refreshChatVisibility))
    chatMenu.appendChild(createCheckbox("markGlobalsRead", "Exclude most globals from unread count", "setting g-green"))
    chatMenu.appendChild(document.createElement('br'))
    chatMenu.appendChild(createCheckbox("clanChannel", "Separate clan channel", "setting yellow", changeChannelVisibility.bind(null, 'chat2', 'clanChannel')))
    chatMenu.appendChild(createCheckbox("clanHide", "Hide clan messages from main channel", "setting yellow", refreshChatVisibility))
    chatMenu.appendChild(document.createElement('br'))
    chatMenu.appendChild(createCheckbox("usernameClick", "View user profile with right click", "setting l-blue"))
    chatMenu.appendChild(createCheckbox("urlToLink", "Turn URLs into clickable links", "setting l-blue"))
    chatMenu.appendChild(createCheckbox("clickableForum", "Turn URLs into links in forum", "setting l-blue"))
    chatMenu.appendChild(document.createElement('br'))
    chatMenu.appendChild(createCheckbox("increaseChat", "Increase chat size limit to 1000", "setting", changeChatSizeLimit))
    chatMenu.appendChild(document.createElement('br'))
    let logHeader = document.createElement("div")
    logHeader.textContent = "Log"
    logHeader.className = "category-header"
    chatMenu.appendChild(logHeader)
    chatMenu.appendChild(createCheckbox("hideCommonDrops", "Hide Common/Fractured drops", "setting white", refreshDropVisibility))
    chatMenu.appendChild(createCheckbox("hideUncommonDrops", "Hide Uncommon/Chipped drops", "setting white", refreshDropVisibility))
    chatMenu.appendChild(createCheckbox("hideLevelUps", "Hide level ups", "setting white", refreshDropVisibility))
    chatMenu.appendChild(document.createElement('br'))
    settingsContainer.appendChild(chatMenu)

    let otherMenu = document.createElement('div')
    otherMenu.className = "settings table-style col-4"
    let otherHeader = document.createElement("div")
    otherHeader.textContent = "Other"
    otherHeader.className = "category-header"
    otherMenu.appendChild(otherHeader)
    otherMenu.appendChild(createCheckbox("startupGathering", "Set gathering as a startup screen", "setting"))
    otherMenu.appendChild(createCheckbox("personalDH", "Ask confirmation on personal DH", "setting"))
    otherMenu.appendChild(createCheckbox("showClanProfile", "Show clan profile in clan popup", "setting"))
    otherMenu.appendChild(createCheckbox("compareTiers", "Tell about cheaper skill tiers", "setting"))
    otherMenu.appendChild(document.createElement('br'))
    otherMenu.appendChild(createCheckbox("hideHeader", "Hide game header", "setting", toggleHeader))
    otherMenu.appendChild(createCheckbox("fixedPopupHeader", "Fixed popup header (requires refresh)", "setting"))
    otherMenu.appendChild(createCheckbox("permanentScrollbar", "Permanent scrollbar (requires refresh)", "setting"))
    otherMenu.appendChild(document.createElement('br'))
    otherMenu.appendChild(createCheckbox("showPower", "Show power and armor", "setting", changeClassDisplay.bind(null, 'power_row', 'showPower', 'table-row')))
    otherMenu.appendChild(createCheckbox("attrBonus", "Show attribute bonus", "setting", changeClassDisplay.bind(null, 'attr_bonus', 'attrBonus', 'inline-block')))
    otherMenu.appendChild(createCheckbox("showQP", "Show quest points (updates on quest completion)", "setting", changeClassDisplay.bind(null, 'qp_row', 'showQP', 'table-row')))
    otherMenu.appendChild(createCheckbox("hideBattleQuest", "Hide battle quests", "setting", changeQuestVisibility))
    otherMenu.appendChild(createCheckbox("hideGatherQuest", "Hide gather quests", "setting", changeQuestVisibility))
    otherMenu.appendChild(createCheckbox("quickQuest", "Show quest re-roll/reduce buttons", "setting", changeQuestVisibility))
    otherMenu.appendChild(document.createElement('br'))
    otherMenu.appendChild(createCheckbox("dhTimer", "Show remaining DH timer", "setting", changeDHTimerSetting))
    otherMenu.appendChild(createCheckbox("enterRift", "Show enter rift button", "setting purple", toggleEnterRift))
    otherMenu.appendChild(document.createElement('br'))
    otherMenu.appendChild(createCheckbox("creditStore", "Show store link next to credits", "setting", changeClassDisplay.bind(null, 'cstore_btn', 'creditStore', 'inline-block')))
    otherMenu.appendChild(createSelect("creditStoreTab", "Which tab credit store link will open", "setting", [
        { value: "purchase", text: "Purchase Credits" },
        { value: "boosts", text: "Boosts" },
        { value: "upgrades", text: "Autos" },
        { value: "misc", text: "Misc" },
        { value: "lp", text: "Loyalty Points" },
        { value: "qp", text: "Quest Points" },
    ]))
    otherMenu.appendChild(document.createElement('br'))

    settingsContainer.appendChild(otherMenu)
}

function createHeaderMenu() {
    //Create HTML elements for header menu
    let headerMenu = document.createElement('div')
    headerMenu.className = "settings table-style col-100 right"
    let otherMenuHeader = document.createElement("div")
    otherMenuHeader.textContent = "Header Links"
    otherMenuHeader.className = "category-header"
    headerMenu.appendChild(otherMenuHeader)

    headerMenu.appendChild(createLink('index.php?logout', 'Logout'))
    headerMenu.appendChild(document.createElement('br'))
    headerMenu.appendChild(createLink('javascript:forum()', 'Forum'))
    headerMenu.appendChild(createLink('http://www.heroesrpg.com/wiki/wiki.html', 'Wiki', true))
    headerMenu.appendChild(createLink('javascript:achievements()', 'Achievements'))
    headerMenu.appendChild(document.createElement('br'))
    headerMenu.appendChild(createLink('javascript:ref()', 'Referrals'))
    headerMenu.appendChild(createLink('javascript:rules()', 'Rules'))
    headerMenu.appendChild(document.createElement('br'))
    headerMenu.appendChild(createLink('javascript:displayPref()', 'Preferences'))
    headerMenu.appendChild(document.createElement('br'))
    headerMenu.appendChild(createLink('javascript:viewLeaderboards(1)', 'Leaderboards'))

    headerMenuContainer.appendChild(headerMenu)
}

function createLink(href, text, newTab) {
    var link = document.createElement('a')
    link.href = href
    link.textContent = text
    if (newTab)
        link.target = '_blank'
    link.className = 'header-link links'
    return link
}

MutationRecord.prototype.isBeingEdited = function () {
    return (typeof this.target.dataset.editing !== "undefined")
}

MutationRecord.prototype.startEdit = function () {
    this.target.dataset.editing = true
}

MutationRecord.prototype.endEdit = function () {
    delete this.target.dataset.editing
}

function refreshChatVisibility() {
    let chatRows = document.querySelectorAll('#chat_table1 > tbody > tr')
    for (let i = 0, row; row = chatRows[i]; i++) {
        if (row.dataset.isOtherGlobal)
            row.style.display = settings.hideOthersGlobal ? 'none' : 'table-row'
        if (row.dataset.isClanMemberGlobal)
            row.style.display = settings.hideClanMembersGlobal ? 'none' : 'table-row'
        if (row.dataset.isClan)
            row.style.display = settings.clanHide ? 'none' : 'table-row'
    }
}

function changeChannelVisibility(channelId, settingName) {
    let chatButton = document.querySelector("[data-channel='" + channelId + "']")
    if (chatButton !== null)
        chatButton.style.display = settings[settingName] ? 'inline-block' : 'none'
}

function changeQuestVisibility() {
    let leftRows = document.querySelectorAll('#main-stats > table > tbody > tr')
    for (let i = 0, row; row = leftRows[i]; i++) {
        if (row.textContent.indexOf('Battle:') === 0)
            row.style.display = settings.hideBattleQuest ? 'none' : 'table-row'
        else if (row.textContent.indexOf('Gather:') === 0)
            row.style.display = settings.hideGatherQuest ? 'none' : 'table-row'
    }

    let row = document.querySelector('.left-quest-action-battle')
    if (settings.quickQuest && !settings.hideBattleQuest)
        row.style.display = 'table-row'
    else
        row.style.display = 'none'

    row = document.querySelector('.left-quest-action-gather')
    if (settings.quickQuest && !settings.hideGatherQuest)
        row.style.display = 'table-row'
    else
        row.style.display = 'none'
}

function changeClassDisplay(elementClass, settingName, display) {
    let rows = document.querySelectorAll('.' + elementClass)
    for (let i = 0, row; row = rows[i]; i++) {
        row.style.display = settings[settingName] ? display : 'none'
    }

    //Update data for few settings when they are turned on
    if (settings[settingName]) {
        switch (settingName) {
            case 'showQP': unsafeWindow.updateQuestPoints(); break
            case 'showPower':
            case 'attrBonus': sendCommand('stats'); break
        }
    }
}

function changeChatSizeLimit() {
    unsafeWindow.chatsize = settings.increaseChat ? 1000 : 100
}

function changeDHTimerSetting() {
    let dhTimerRow = document.getElementById('dhtimerow')
    if (dhTimerRow !== null) {
        dhTimerRow.style.display = settings.dhTimer ? 'table-row' : 'none'
        if (settings.dhTimer) {
            sendCommand('dh')
        } else {
            if (dhInterval !== null)
                clearInterval(dhInterval)
            dhInterval = null
        }
    }
}

function prepareClanChannel() {
    let form = document.createElement('div')
    let input = document.createElement('input')
    let button = document.createElement('input')

    input.id = "clan_chat_input"
    input.className = "clan_chat_input"
    input.maxlength = 400
    input.autocomplete = false
    input.type = "text"
    input.addEventListener("keyup", function (e) {
        if (e.keyCode === 13)
            sendClanMessage()
    })

    button.type = "button"
    button.value = "Chat"
    button.addEventListener("click", sendClanMessage)

    form.appendChild(input)
    form.appendChild(button)
    clanChatContainer.appendChild(form)

    clanChat = document.createElement('table')
    clanChat.id = "chat_table2"
    clanChat.className = "chat_table2"
    clanChat.className += " chat2 table tr td";
    clanChatContainer.appendChild(clanChat)
    if (!settings.clanChannel) {
        let clanChatButton = document.querySelector("[data-channel='chat2']")
        if (clanChatButton !== null)
            clanChatButton.style.display = "none"
    }
}

function sendClanMessage() {
    let clanInput = document.getElementById('clan_chat_input')
    let chatInput = document.getElementById('chat_input')
    let message = clanInput.value

    if (message.indexOf("/clan ") === 0)
        chatInput.value = message
    else if (message.indexOf("/c ") === 0)
        chatInput.value = message
    else
        chatInput.value = "/c " + message

    unsafeWindow.send_chat()
    clanInput.value = ""
}

function processLogRows() {
    let logRows = document.querySelectorAll('#chat_table10 tr')
    for (let j = 0, row; row = logRows[j]; j++) {
        let currentRow = parseInt(row.id.substring(7))
        if (currentRow <= lastLogRow)
            continue

        //Prepare message by removing timestamp for better text processing
        let time = row.textContent.substring(0, 10)
        let message = row.textContent.substring(11)

        //Detect quest completion
        if (message.match(/You have completed your (.+) quest/)) {
            if (settings.notifyQuest)
                notify(message)
            if (settings.showQP)
                unsafeWindow.updateQuestPoints()
        }

        //Detect item sales
        if (settings.notifySales && message.match(/You have sold/)) {
            notify(message)
        }

        //Detect common drops
        if (message.match(/Common|Fractured/)) {
            row.dataset.isCommonDrop = true
            if (settings.hideCommonDrops) {
                row.style.display = settings.hideCommonDrops ? 'none' : 'table-row'
                //Exclude low drops from unread count on Log channel tab
                unsafeWindow.chatcount10--
                if (unsafeWindow.chatcount10 < 0)
                    unsafeWindow.chatcount10 = 0
                document.getElementById('chatcount10').textContent = (unsafeWindow.chatcount10 !== 0 ? " (" + unsafeWindow.chatcount10 + ")" : "")
            }
        }

        //Detect uncommon drops
        if (message.match(/Uncommon|Chipped/)) {
            row.dataset.isUncommonDrop = true
            if (settings.hideUncommonDrops) {
                row.style.display = settings.hideUncommonDrops ? 'none' : 'table-row'
                //Exclude low drops from unread count on Log channel tab
                unsafeWindow.chatcount10--
                if (unsafeWindow.chatcount10 < 0)
                    unsafeWindow.chatcount10 = 0
                document.getElementById('chatcount10').textContent = (unsafeWindow.chatcount10 !== 0 ? " (" + unsafeWindow.chatcount10 + ")" : "")
            }
        }


        //Detect level ups
        if (message.match(/You have gained a level and rolled/)) {
            row.dataset.isLevelUp = true
            if (settings.hideLevelUps) {
                row.style.display = settings.hideLevelUps ? 'none' : 'table-row'
                //Exclude low drops from unread count on Log channel tab
                unsafeWindow.chatcount10--
                if (unsafeWindow.chatcount10 < 0)
                    unsafeWindow.chatcount10 = 0
                document.getElementById('chatcount10').textContent = (unsafeWindow.chatcount10 !== 0 ? " (" + unsafeWindow.chatcount10 + ")" : "")
            }
        }

        //Color chests and lockpicks
        //You have found a(n) Uncommon Treasure Chest
        //You have found a(n) Uncommon Lockpick
        let regexUncommon = /(.*)(Uncommon Treasure Chest|Uncommon Lockpick)/
        let regexRare = /(.*)(Rare Treasure Chest|Rare Lockpick)/
        let regexEpic = /(.*)(Epic Treasure Chest|Epic Lockpick)/
        let regexLegendary = /(.*)(Legendary Treasure Chest|Legendary Lockpick)/
        if (message.match(regexUncommon)) {
            let match = regexUncommon.exec(message)
            row.childNodes[0].innerHTML = "<td><span class='time'>" + time + "</span> " + match[1] + "<span class='uncommon'>" + match[2] + "</span></td>"
        } else if (message.match(regexRare)) {
            let match = regexRare.exec(message)
            row.childNodes[0].innerHTML = "<td><span class='time'>" + time + "</span> " + match[1] + "<span class='rare'>" + match[2] + "</span></td>"
        } else if (message.match(regexEpic)) {
            let match = regexEpic.exec(message)
            row.childNodes[0].innerHTML = "<td><span class='time'>" + time + "</span> " + match[1] + "<span class='epic'>" + match[2] + "</span></td>"
        } else if (message.match(regexLegendary)) {
            let match = regexLegendary.exec(message)
            row.childNodes[0].innerHTML = "<td><span class='time'>" + time + "</span> " + match[1] + "<span class='legendary'>" + match[2] + "</span></td>"
        }

        //Color gems
        //You have found a Fractured Sapphire.
        //You have found a Chipped Sapphire.
        let regexRuby = /(.* )(.* Ruby)(\.)/
        let regexEmerald = /(.* )(.* Emerald)(\.)/
        let regexDiamond = /(.* )(.* Diamond)(\.)/
        let regexSapphire = /(.* )(.* Sapphire)(\.)/
        let regexAmethyst = /(.* )(.* Amethyst)(\.)/
        if (message.match(regexRuby)) {
            let match = regexRuby.exec(message)
            row.childNodes[0].innerHTML = "<td><span class='time'>" + time + "</span> " + match[1] + "<span class='red'>" + match[2] + "</span>" + match[3] + "</td>"
        } else if (message.match(regexEmerald)) {
            let match = regexEmerald.exec(message)
            row.childNodes[0].innerHTML = "<td><span class='time'>" + time + "</span> " + match[1] + "<span class='g-green'>" + match[2] + "</span>" + match[3] + "</td>"
        } else if (message.match(regexDiamond)) {
            let match = regexDiamond.exec(message)
            row.childNodes[0].innerHTML = "<td><span class='time'>" + time + "</span> " + match[1] + "<span class='l-blue'>" + match[2] + "</span>" + match[3] + "</td>"
        } else if (message.match(regexSapphire)) {
            let match = regexSapphire.exec(message)
            row.childNodes[0].innerHTML = "<td><span class='time'>" + time + "</span> " + match[1] + "<span class='blue'>" + match[2] + "</span>" + match[3] + "</td>"
        } else if (message.match(regexAmethyst)) {
            let match = regexAmethyst.exec(message)
            row.childNodes[0].innerHTML = "<td><span class='time'>" + time + "</span> " + match[1] + "<span class='purple'>" + match[2] + "</span>" + match[3] + "</td>"
        }
    }

    lastLogRow = parseInt(logRows[0].id.substring(7))
}

function processMainChatRows(chatRows) {
    for (let j = chatRows.length - 1, row; row = chatRows[j]; j--) {
        //Stop after we are reached to previously checked messages, no need for double check
        let currentRow = parseInt(row.id.substring(6))
        if (currentRow <= lastChatRow)
            continue

        //Prepare message by removing timestamp for better text processing
        let message = row.textContent.substring(11)

        //Detect if message part is colored, needed if someone writes keywords like [Clan] in normal channel
        let rowNodes = row.childNodes[0].childNodes
        let lastNode = rowNodes[rowNodes.length - 1]
        let hasClanColor = false, hasTradeColor = false, hasPrivateColor = false, hasCommandColor = false
        if (typeof lastNode.style !== "undefined") {
            if (lastNode.style.color === "rgb(255, 255, 0)")
                hasClanColor = true
            else if (lastNode.style.color === "rgb(0, 187, 0)")
                hasTradeColor = true
            else if (lastNode.style.color === "rgb(255, 113, 113)")
                hasPrivateColor = true
            else if (lastNode.style.color === "rgb(85, 170, 85)")
                hasCommandColor = true
        }

        //Make urls clickable
        //This regex is not complete and may contain some security risks
        //Source: https://gist.github.com/gruber/8891611#gistcomment-1002063
        if (settings.urlToLink) {
            let lastChild = row.childNodes[0].lastChild.innerHTML
            row.childNodes[0].lastChild.innerHTML = lastChild.replace(
                /(([a-z]{3,6}:\/\/)|)([a-zA-Z0-9\-]+\.)+[a-z]{2,13}[\.\?\=\&\%\/\w\-]*\b(['\"]?)/gi,
                function (match, g1, g2, g3, g4) {
                    //Check if url ends with quotes, then it's probably somewhere in html
                    //Could use negative lookbehind but it doesn't work in ES6 yet
                    if (g4 !== '')
                        return match

                    let url = match
                    if (!match.match(/^http/i))
                        url = "//" + match
                    return '<a href="' + url + '" target="_blank">' + match + '</a>'
                }
            )
        }

        //Check for PM
        if (hasPrivateColor && !isFirstChatMutation && message.match(/Message Received:/g) && settings.notifyPM) {
            notify(message)
        }

        //Check for Trade
        if (hasTradeColor && message.match(/\[Trade\]/g)) {
            //Don't notify about users own message
            let pattern = new RegExp('\\[Trade\\] ' + username + ': ', 'g')
            if (message.match(pattern) === null) {
                if (settings.notifTrade && !isFirstChatMutation)
                    notify(message)
            }
        }

        //Color globals
        //Global: xyz has found a(n) Rare Treasure Chest!
        //Global: xyz has found a(n) Rare Lockpick!
        let regexRare = /^(Global:.*)(Rare Treasure Chest|Rare Lockpick)(!)/
        let regexEpic = /^(Global:.*)(Epic Treasure Chest|Epic Lockpick)(!)/
        let regexLegendary = /^(Global:.*)(Legendary Treasure Chest|Legendary Lockpick)(!)/
        if (message.match(regexRare)) {
            let match = regexRare.exec(message)
            row.childNodes[0].lastChild.innerHTML = match[1] + "<span class='rare'>" + match[2] + "</span>" + match[3]
        } else if (message.match(regexEpic)) {
            let match = regexEpic.exec(message)
            row.childNodes[0].lastChild.innerHTML = match[1] + "<span class='epic'>" + match[2] + "</span>" + match[3]
        } else if (message.match(regexLegendary)) {
            let match = regexLegendary.exec(message)
            row.childNodes[0].lastChild.innerHTML = match[1] + "<span class='legendary'>" + match[2] + "</span>" + match[3]
        }

        //Check for global
        if (message.match(/^Global: /)) {
            //Is it yours?
            let pattern = new RegExp('^Global: ' + username, 'g')
            if (message.match(pattern)) {
                if (settings.shortenRiftKill)
                    shortenRiftKillMessage(row)
                if (settings.notifMyGlobal && !isFirstChatMutation)
                    notify(message, "cheerful")
            } else {
                //And if it's not your global, it must be someone else's
                let regex = /^Global: (.*?) (has|gained|rolled|goes|found|is)/
                if (message.match(regex)) {
                    if (message.match(/^Global: (.+) has closed with a Riftscore multiplier/) === null &&
                        message.match(/^Global: (.+) has opened! The/) === null &&
                        message.match(/^Global: (.+) will close in/) === null) {

                        //Let's hide other player gloals
                        let match = regex.exec(message)

                        if (hextClanMemberCache.includes(match[1])) {
                            row.dataset.isClanMemberGlobal = true
                            if (settings.hideClanMembersGlobal)
                                row.style.display = "none"
                        } else {
                            row.dataset.isOtherGlobal = true
                            if (settings.hideOthersGlobal)
                                row.style.display = "none"
                        }
                    }
                }

                //Exclude globals from unread count on Chat channel tab
                if ((settings.markGlobalsRead || settings.hideOthersGlobal)) {
                    unsafeWindow.chatcount1--
                    if (unsafeWindow.chatcount1 < 0)
                        unsafeWindow.chatcount1 = 0
                    document.getElementById('chatcount1').textContent = (unsafeWindow.chatcount1 !== 0 ? " (" + unsafeWindow.chatcount1 + ")" : "")
                }

                //Maybe it's a Rift :O
                if (message.match(/^Global: A Rift will open in 5 minutes!/g)) {
                    if (settings.notifRift && !isFirstChatMutation)
                        notify(message, "eerie")
                    riftSoon = true
                }

                if (message.match(/^Global: (.*) Rift has opened!/g)) {
                    if (settings.notifRift && !isFirstChatMutation)
                        notify(message, "eerie")
                    riftSoon = false
                    riftActive = true
                }

                if (message.match(/^Global: (.+) has closed with a Riftscore multiplier/g)) {
                    riftSoon = false
                    riftActive = false
                }

                if (settings.shortenRiftKill)
                    shortenRiftKillMessage(row)

                //Do we need to update inner dh timer?
                if (settings.dhTimer && message.match(/^Global: Everyone will receive (Double Haste|Double|Haste)/i))
                    sendCommand('dh')
            }
        }

        //Check for clan global
        if (message.match(/^Clan Global: /)) {
            row.dataset.isClan = true
            if (settings.notifClanGlobal && !isFirstChatMutation)
                notify(message)

            //Do we need to update inner dh timer?
            if (settings.dhTimer && message.match(/^Clan Global: Your Clan has activated /))
                sendCommand('dh')

            //Add copy to clan tab
            let clone = row.cloneNode(true)
            clone.id = "ct2_tr" + clone.id.substring(6)
            clanChat.insertBefore(clone, clanChat.firstChild)

            //Change message count                        
            if (!isFirstChatMutation && unsafeWindow.chatview !== 2) {
                clone.dataset.unread = "true"
                let count = document.querySelectorAll("#chat_table2 [data-unread]").length
                document.getElementById('chatcount2').textContent = (count !== 0 ? " (" + count + ")" : "")
            }

            //Hide from main chat
            if (settings.clanHide)
                row.style.display = "none"

            //Decrease main channel messages count when clan channel is turned on
            if (settings.clanChannel) {
                unsafeWindow.chatcount1--
                if (unsafeWindow.chatcount1 < 0)
                    unsafeWindow.chatcount1 = 0
                document.getElementById('chatcount1').textContent = (unsafeWindow.chatcount1 !== 0 ? " (" + unsafeWindow.chatcount1 + ")" : "")
            }
        }

        //Check for clan chat messages
        if (hasClanColor && message.match(/\[Clan\]/)) {
            row.dataset.isClan = true

            //Don't notify about users own message
            let pattern = new RegExp('\\[Clan\\] ' + username + ': ', 'g')
            let isMyMessage = message.match(pattern) !== null
            if (settings.notifClanMessage && !isFirstChatMutation && !isMyMessage)
                notify(message)

            //Add copy to clan tab
            let clone = row.cloneNode(true)
            clone.id = "ct2_tr" + clone.id.substring(6)
            clanChat.insertBefore(clone, clanChat.firstChild)

            //Make right click listener for usernames in clan channel
            if (settings.usernameClick) {
                let link = clone.querySelector('a')
                if (link !== null) {
                    if (link.href.indexOf("javascript:m") === 0) {
                        link.href = "javascript:" //Disable default behavior
                        link.addEventListener("click", function (e) {
                            unsafeWindow.m(this.textContent)
                        })
                        link.addEventListener("contextmenu", function (e) {
                            e.preventDefault()
                            unsafeWindow.viewPlayer(this.textContent)
                            return false
                        })
                    }
                }
            }

            //Change message count                        
            if (!isFirstChatMutation && unsafeWindow.chatview !== 2 && !isMyMessage) {
                clone.dataset.unread = "true"
                let count = document.querySelectorAll("#chat_table2 [data-unread]").length
                document.getElementById('chatcount2').textContent = (count !== 0 ? " (" + count + ")" : "")
            }

            //Hide from main chat
            if (settings.clanHide)
                row.style.display = "none"

            //Decrease main channel messages count when clan channel is turned on
            if (settings.clanChannel) {
                unsafeWindow.chatcount1--
                if (unsafeWindow.chatcount1 < 0)
                    unsafeWindow.chatcount1 = 0
                document.getElementById('chatcount1').textContent = (unsafeWindow.chatcount1 !== 0 ? " (" + unsafeWindow.chatcount1 + ")" : "")
            }
        }

        //Do we need to update inner dh timer?
        if (settings.dhTimer && message.match(/of personal Double Haste./))
            sendCommand('dh')

        //Find /dh command result in chat, parse and then hide it
        if (hasCommandColor && (message.match(/(Double|Haste) is running for another (.+)!/) || message.match(/(Double|Haste) is not currently running./))) {
            //Double is running for another 2 Hours 27 Minutes 58 Seconds!
            //Haste is running for another 2 Hours 27 Minutes 58 Seconds!
            //Double is not currently running.
            //Haste is not currently running.
            boostTime.double = 0
            boostTime.haste = 0
            let outerRegex = /(Double|Haste) is running for another ([^.!]+)[.!]/g
            let outerMatch = null
            while ((outerMatch = outerRegex.exec(message)) !== null) {
                let boostName = outerMatch[1].toLowerCase()
                let timePart = outerMatch[2]
                let regex = /(\d+) (Day|Hour|Minute|Second)s?/gi
                let match = null
                while ((match = regex.exec(timePart)) !== null) {
                    let timeAmount = parseInt(match[1])
                    let timeUnit = match[2].toLowerCase()
                    switch (timeUnit) {
                        case 'day': boostTime[boostName] += timeAmount * 86400; break
                        case 'hour': boostTime[boostName] += timeAmount * 3600; break
                        case 'minute': boostTime[boostName] += timeAmount * 60; break
                        case 'second': boostTime[boostName] += timeAmount; break
                    }
                }
            }
            if (settings.dhTimer) {
                if (dhInterval !== null)
                    clearInterval(dhInterval)
                dhInterval = setInterval(updateDHTimer, 10000)
            }

            updateDHTimer(true)

            //Hide chat row caused by our dh query
            if (unsafeWindow.cmdFlags.dh || isFirstChatMutation) {
                if (!isFirstChatMutation)
                    unsafeWindow.cmdFlags.dh = false

                row.dataset.internalCommand = "true"
                row.style.display = "none"

                unsafeWindow.chatcount1--
                if (unsafeWindow.chatcount1 < 0)
                    unsafeWindow.chatcount1 = 0
                document.getElementById('chatcount1').textContent = (unsafeWindow.chatcount1 !== 0 ? " (" + unsafeWindow.chatcount1 + ")" : "")
            }
        }

        if (hasCommandColor) {
            let hide = false

            //Find /stats command result in chat, parse and then hide it
            let stats = message.match(/Strength: ([\d,]+)Dexterity: ([\d,]+)Stamina: ([\d,]+)Power: ([\d,]+)Armor: ([\d,]+)/)
            if (stats) {
                if (settings.attrBonus) {
                    let _attributes = ['a_str', 'a_dex', 'a_sta']
                    for (let ai = 0, attr; attr = _attributes[ai]; ai++) {
                        let baseAttrElement = document.getElementById(attr)
                        if (baseAttrElement) {
                            let baseAttr = baseAttrElement.textContent.toInt()
                            let bonusAttrElement = document.getElementById("ext_" + attr + "_bonus")
                            if (bonusAttrElement)
                                bonusAttrElement.textContent = "+" + (stats[ai + 1].toInt() - baseAttr).thousandSeparate()
                        }
                    }
                }

                if (settings.showPower) {
                    let power = document.getElementById('ext_a_power')
                    let armor = document.getElementById('ext_a_armor')
                    if (power)
                        power.textContent = stats[4]
                    if (armor)
                        armor.textContent = stats[5]
                }

                if (unsafeWindow.cmdFlags.stats) {
                    unsafeWindow.cmdFlags.stats = false
                    hide = true
                }
            }

            //Hide chat row caused by our stats query
            if (hide || isFirstChatMutation) {
                row.dataset.internalCommand = "true"
                row.style.display = "none"

                unsafeWindow.chatcount1--
                if (unsafeWindow.chatcount1 < 0)
                    unsafeWindow.chatcount1 = 0
                document.getElementById('chatcount1').textContent = (unsafeWindow.chatcount1 !== 0 ? " (" + unsafeWindow.chatcount1 + ")" : "")
            }
        }

        //Make right click listener for usernames
        if (settings.usernameClick) {
            let link = row.querySelector('a')
            if (link !== null) {
                if (link.href.indexOf("javascript:m(") !== -1) {
                    link.href = "javascript:" //Disable default behavior
                    link.addEventListener("click", function (e) {
                        unsafeWindow.m(this.textContent)
                    })
                    link.addEventListener("contextmenu", function (e) {
                        e.preventDefault()
                        unsafeWindow.viewPlayer(this.textContent)
                        return false
                    })
                }
            }
        }
    }
}

function shortenRiftKillMessage(row) {
    //Shorten rift kill message
    //Global: ZN Tanar (Level 150,000) landed the killing blow on the Hades [7] (Level 150,000) obtaining 1 Soul Shard(s) and 1,156 Riftscore! An additional x1.8 Riftscore multiplier was added to the Rift!
    //Global: ZN Tanar (150,000) killed Hades [7] (150,000): 2 Shard(s), 1,156 Riftscore, x1.8 multiplier!
    let shortenRiftKillRegex = /^Global: (.+) \(Level (.+)\) landed the killing blow on the (.+) \(Level (.+)\) obtaining (.+) Soul Shard\(s\) and (.+) Riftscore! An additional (.+) Riftscore multiplier was added to the Rift!/
    let match = shortenRiftKillRegex.exec(row.childNodes[0].lastChild.textContent)
    if (match) {
        row.childNodes[0].lastChild.innerHTML = 'Global: <a href="javascript:m(' + match[1] + ')">' + match[1] + '</a> (' + match[2] + ') killed ' + match[3] + ' (' + match[4] + '): ' + match[5] + ' Shard(s), ' + match[6] + ' Riftscore, ' + match[7] + ' multiplier!'
    }
}

function updateDHTimer(keepTime) {
    let decreaseTime = true
    if (typeof keepTime !== "undefined")
        decreaseTime = !keepTime

    let totalSeconds = 0
    let message = "<span class='greytext'>No boost is running</span>"
    if (boostTime.haste > 0 && boostTime.double > 0) {
        totalSeconds = Math.min(boostTime.haste, boostTime.double)
        message = "DH is running for "
        if (decreaseTime) {
            boostTime.haste -= 10
            boostTime.double -= 10
        }
    } else if (boostTime.haste > 0) {
        totalSeconds = boostTime.haste
        message = "Haste is running for "
        if (decreaseTime)
            boostTime.haste -= 10
    } else if (boostTime.double > 0) {
        totalSeconds = boostTime.double
        message = "Double is running for "
        if (decreaseTime)
            boostTime.double -= 10
    } else {
        if (dhInterval !== null)
            clearInterval(dhInterval)
        dhInterval = null
    }

    let timeStr = ""
    if (totalSeconds > 0) {
        let days = Math.floor(totalSeconds / 86400)
        totalSeconds %= 86400
        let hours = Math.floor(totalSeconds / 3600)
        totalSeconds %= 3600
        let minutes = Math.floor(totalSeconds / 60)

        if (days === 0) {
            if (hours === 0)
                timeStr = minutes === 0 ? "1m" : minutes + "m"
            else
                timeStr = hours + "h " + minutes + "m"
        } else {
            if (hours === 0)
                timeStr = days + "d " + minutes + "m"
            else
                timeStr = days + "d " + hours + "h"
        }
    }

    let dhTimeTd = document.getElementById('dhtime')
    if (dhTimeTd !== null)
        dhTimeTd.innerHTML = message + timeStr
}

function sendCommand(command) {
    unsafeWindow.send_chat_command(command)
}

function gemInfo(gemName, prepend) {
    if (typeof prepend === 'undefined')
        prepend = true

    var words = gemName.split(' ')
    var result = ""
    switch (words[1]) {
        case "Ruby": result = " (Exp "; break
        case "Emerald": result = " (Gold "; break
        case "Diamond": result = " (Attr "; break
        case "Sapphire": result = " (Battl SP "; break
        case "Amethyst": result = " (TS Exp "; break
        default: break
    }
    switch (words[0]) {
        case "Fractured": result += "0.5%)"; break
        case "Chipped": result += "1%)"; break
        case "Dull": result += "1.5%)"; break
        case "Clouded": result += "2%)"; break
        case "Bright": result += "2.5%)"; break
        case "Glowing": result += "3%)"; break
        case "Radiant": result += "4%)"; break
        case "Flawless": result += "5%)"; break
        case "Perfect": result += "7.5%)"; break
        case "Priceless": result += "10%)"; break
        default: break
    }

    if (prepend) {
        let color = gemColor(gemName)
        return '<small class="xx-small ' + color + '">' + gemName + result + '</small>'
    } else {
        return result
    }
}

function gemColor(gemName) {
    var words = gemName.split(' ')
    switch (words[1]) {
        case "Ruby": return "red"
        case "Emerald": return "g-green"
        case "Diamond": return "l-blue"
        case "Sapphire": return "blue"
        case "Amethyst": return "purple"
        default: return ""
    }
}

function addGemInfo(string) {
    return string.replace(/(Fractured|Chipped|Dull|Clouded|Bright|Glowing|Radiant|Flawless|Perfect|Priceless) (Ruby|Emerald|Diamond|Sapphire|Amethyst)(?! \()/g, function (x) { return gemInfo(x, true); })
}

function addGemDropdownColorClass(id) {
    let gemList = document.getElementById(id)
    if (gemList !== null) {
        for (let g = 0, gem; gem = gemList.children[g]; g++) {
            let pos = gem.textContent.indexOf('(')
            if (pos !== -1)
                gem.classList.add(gemColor(gem.textContent.substring(0, pos - 1)))
        }
    }
}

function createStat(row, id, name) {
    var c1 = document.createElement('td')
    c1.innerHTML = "<a href='javascript:statReset(\"" + id + "\",-1)'>[R]</a> " + name
    var c2 = document.createElement('td')
    c2.id = id
    c2.dataset.value = 0
    c2.textContent = "0"
    row.append(c1)
    row.append(c2)
}

function addMaterialStat(add) {
    currentMatAvg = ((currentMatAvg * currentMatActions) + add) / (currentMatActions + 1)
    currentMatActions++
    currentMatUsage += add

    stats.allTimeMatUsageAvg = ((stats.allTimeMatUsageAvg * stats.allTimeMatUsageCount) + add) / (stats.allTimeMatUsageCount + 1)
    stats.allTimeMatUsageCount++

    // Save after every 30 actions to reduce wear of client SSD
    if (stats.allTimeMatUsageCount % 30 === 0)
        GM.setValue("HExt_stats", stats)
}

function getSkillData(id) {
    for (let i = 0, tuple; tuple = skillTuples[i]; i++)
        if (tuple.ids.indexOf(id) !== -1)
            return tuple

    return null
}

function openSkillTrain(id) {
    let skillProperties = getSkillData(id)
    if (settings.compareTiers && typeof skillProperties.ratio !== 'undefined') {
        Promise.all(skillProperties.ids.map(unsafeWindow.getSkillCost)).then(function (results) {
            let minCost1 = Number.MAX_SAFE_INTEGER
            let minCost1Tier = -1
            let minCost10 = Number.MAX_SAFE_INTEGER
            let minCost10Tier = -1
            let currentHtml = ""
            let currentTier = -1
            for (let i = 0, skill; skill = results[i]; i++) {
                if (typeof skill === "object") {
                    let tier = skillProperties.ids.indexOf(skill.id)
                    let costX1 = skill.cost1.toInt() * skillProperties.ratio[tier]
                    let costX10 = skill.cost10.toInt() * skillProperties.ratio[tier]

                    if (skill.id === id) {
                        currentHtml = skill.html
                        currentTier = tier
                    }

                    if (costX1 < minCost1) {
                        minCost1Tier = tier
                        minCost1 = costX1
                    }

                    if (costX10 < minCost10) {
                        minCost10Tier = tier
                        minCost10 = costX10
                    }
                }
            }

            if (currentTier === minCost1Tier)
                message1 = '<span class="greytext">This skill tier is the cheapest</span>'
            else
                message1 = '<span class="red">Skill tier ' + (minCost1Tier + 1) + ' is cheaper than this</span>'

            if (currentTier === minCost10Tier)
                message10 = '<span class="greytext">This skill tier is the cheapest</span>'
            else
                message10 = '<span class="red">Skill tier ' + (minCost10Tier + 1) + ' is cheaper than this</span>'

            currentHtml = currentHtml.replace(/Train 1x<\/a> \(([\d,]+) SP\)/, function (match, m1) { return 'Train 1x</a> (' + m1 + ' SP)<br>' + message1 })
            currentHtml = currentHtml.replace(/Train 10x<\/a> \(([\d,]+) SP\)/, function (match, m1) { return 'Train 10x</a> (' + m1 + ' SP)<br>' + message10 })

            unsafeWindow.showSkillPopup()
            let skillPopupHTML = '<h2>View Skill</h2><p>' + currentHtml + '</p>'
            document.getElementById('skill-popup-content').innerHTML = skillPopupHTML
        })
    } else {
        unsafeWindow.skillTrain(id, 0)
    }
}

function prepareSkillTrainLinks(element) {
    if (typeof element === "undefined")
        element = document

    let skillLinks = element.querySelectorAll('a')
    for (let i = 0, link; link = skillLinks[i]; i++) {
        let match = link.href.match(/javascript:skillTrain\((\d+), 0\)/)
        if (match) {
            let id = match[1].toInt()
            if (getSkillData(id)) {
                link.href = "javascript:;"
                link.addEventListener('click', openSkillTrain.bind(null, id))
            }
        }
    }
}

function createCheckbox(name, text, className, callback) {
    let div = document.createElement("div")
    div.className = className

    let checkBoxDom = document.createElement("input")
    checkBoxDom.type = "checkbox"
    checkBoxDom.id = "HExt_" + name
    checkBoxDom.value = "1"

    if (settings[name] === true)
        checkBoxDom.checked = "checked"

    checkBoxDom.addEventListener("change", function (e) {
        settings[e.target.id.substring(5)] = e.target.checked
        GM.setValue("HExt_settings", settings)
    })

    if (typeof callback === "function")
        checkBoxDom.addEventListener("change", callback)
    div.appendChild(checkBoxDom)

    let label = document.createElement('label')
    label.textContent = text
    label.htmlFor = "HExt_" + name
    div.appendChild(label)
    return div
}

function createSelect(name, text, className, options, callback) {
    let div = document.createElement("div")
    div.className = className

    let selectDom = document.createElement("select")
    selectDom.id = "HExt_" + name

    for (let i = 0, opt; opt = options[i]; i++) {
        let option = document.createElement("option")
        option.textContent = opt.text
        option.value = opt.value
        if (opt.value === settings[name])
            option.selected = true
        selectDom.appendChild(option)
    }

    selectDom.addEventListener("change", function (e) {
        console.log(this, this.options[this.selectedIndex].value)
        settings[name] = this.options[this.selectedIndex].value
        GM.setValue("HExt_settings", settings)

        //Update global values when they exsists
        if (typeof unsafeWindow[name] !== "undefined")
            unsafeWindow[name] = settings[name]
    })

    if (typeof callback === "function")
        checkBoxDom.addEventListener("change", callback)

    let label = document.createElement('label')
    label.textContent = text
    label.htmlFor = "HExt_" + name
    div.appendChild(label)
    div.appendChild(selectDom)
    return div
}

function createChannel(id, name) {
    let channel = document.createElement('div')
    channel.id = "chat" + id
    channel.number = id
    channel.style.display = "none"
    channels.push(channel) //Add to internal channel list

    createChannelButton(id, name)

    let leftSection = document.getElementById('left')
    leftSection.insertBefore(channel, leftSection.lastElementChild)
    return channel
}

function createChannelButton(channelId, name) {
    let button = document.createElement('button')
    button.dataset.channel = "chat" + channelId
    button.channelNumber = channelId
    button.addEventListener('click', function () {
        //Hide all channels and show clicked one
        for (let i = 0, channel; channel = channels[i]; i++) {
            if (channel.id === this.dataset.channel) {
                channel.style.display = "block"
                this.count.textContent = ""
                if (this.channelNumber === 1)
                    unsafeWindow.chatcount1 = 0
                if (this.channelNumber === 10)
                    unsafeWindow.chatcount10 = 0
                unsafeWindow.chatview = this.channelNumber

                //Mark clan messages as read
                if (this.channelNumber === 2) {
                    let messages = document.querySelectorAll("#chat_table2 [data-unread]")
                    for (let j = 0, msg; msg = messages[j]; j++)
                        delete msg.dataset.unread
                }
            } else {
                channel.style.display = "none"
            }
        }
    })

    let text = document.createTextNode(name)
    let count = document.createElement('span')
    count.id = "chatcount" + channelId
    button.appendChild(text)
    button.appendChild(count)
    button.count = count

    channelBtnContainer.appendChild(button)
    return button
}

function notifyNewVersion() {
    let chat = document.querySelector('#chat_table1 > tbody')
    if (chat !== null) {
        let tr = document.createElement('tr')
        tr.id = "ct1_tr" + unsafeWindow.chatid1
        tr.innerHTML = '<td>[ <span class="blue">HRPG Extension has been updated to v' + version +
            ', read about changes in the <a href="javascript:viewThread(2, 944);">forum</a> ' +
            'or on <a href="https://github.com/dolioz/hrpgext" target="_blank">github</a></span>]</td>'
        chat.insertBefore(tr, chat.firstElementChild)
        unsafeWindow.chatid1++
    }
}

function prepareLogChannel() {
    let log = document.querySelector("#chat10")
    let div = document.createElement('div')
    div.className = "table-style"
    div.style.padding = "2px 2px"
    div.style.width = "748px"
    div.style.height = "15px"
    let a = document.createElement('a')
    a.href = "javascript:"
    a.textContent = "[Clear log]"
    a.addEventListener("click", function () {
        let logs = document.querySelector("#chat_table10 tbody")
        if (logs !== null) {
            logs.innerHTML = ""
            unsafeWindow.chatid10 = 0
        }
    })
    div.appendChild(a)

    if (log.firstElementChild)
        log.insertBefore(div, log.firstElementChild)
    else
        log.appendChild(div)
}

function refreshDropVisibility() {
    let chatRows = document.querySelectorAll('#chat_table10 tr')
    for (let i = 0, row; row = chatRows[i]; i++) {
        if (row.dataset.isCommonDrop)
            row.style.display = settings.hideCommonDrops ? 'none' : 'table-row'
        if (row.dataset.isUncommonDrop)
            row.style.display = settings.hideUncommonDrops ? 'none' : 'table-row'
        if (row.dataset.isLevelUp)
            row.style.display = settings.hideLevelUps ? 'none' : 'table-row'
    }
}

function notify(message, sound) {
    if (settings.notifyPause)
        return

    if (typeof sound === 'undefined') {
        notifSound.play()
    } else if (sound == "cheerful") {
        cheerfulSound.volume = 0.6
        cheerfulSound.play()
    } else if (sound == "eerie") {
        eerieSound.play()
    }

    let n = new Notification("Heroes RPG", {
        body: message
    })
}

String.prototype.toInt = function () {
    return parseInt(this.replace(/,/g, ''))
}

Number.prototype.thousandSeparate = function () {
    return this.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")
}

//Source: https://stackoverflow.com/questions/9461621/how-to-format-a-number-as-2-5k-if-a-thousand-or-more-otherwise-900-in-javascrip
function nFormatter(num, digits) {
    var si = [
        { value: 1, symbol: "" },
        { value: 1E3, symbol: "k" },
        { value: 1E6, symbol: "M" },
        { value: 1E9, symbol: "G" },
        { value: 1E12, symbol: "T" },
        { value: 1E15, symbol: "P" },
        { value: 1E18, symbol: "E" }
    ]
    var rx = /\.0+$|(\.[0-9]*[1-9])0+$/
    var i
    for (i = si.length - 1; i > 0; i--) {
        if (num >= si[i].value)
            break
    }
    return (num / si[i].value).toFixed(digits).replace(rx, "$1") + si[i].symbol
}

//Source: https://github.com/vlmlee/Root-Finding
function newtonRaphson(guess, increment, iteration, eps, f) {
    let rootFound = false

    for (let i = 0; i < iteration + 1; i++) {
        let fPrime = (f(guess + increment / 2) - f(guess - increment / 2)) / increment
        guess += -f(guess) / fPrime
        if (Math.abs(f(guess)) <= eps) {
            rootFound = true
            break
        }
    }

    if (rootFound)
        return guess
    else
        return false
}

function addStyleSheet() {
    let sheet
    let style = document.createElement('style')
    style.type = "text/css"
    let head = document.getElementsByTagName('head')[0]
    head.appendChild(style)
    sheet = style.sheet
    sheet.insertRule('.col-4 {width: 32.6%;}', sheet.cssRules.length)
    sheet.insertRule('.col-100 {width: 100%;}', sheet.cssRules.length)
    sheet.insertRule('.links {padding: 4px 4px;}', sheet.cssRules.length)
    sheet.insertRule('.right {text-align: right;}', sheet.cssRules.length)
    sheet.insertRule('#channels {display: flex;}', sheet.cssRules.length)
    sheet.insertRule('#channels button {width: auto; flex: 1 0 auto;}', sheet.cssRules.length)
    sheet.insertRule('.settings {color: white; background: #2e2e2e; display: inline-block; vertical-align: top;}', sheet.cssRules.length)
    sheet.insertRule('.settings input {vertical-align: top;}', sheet.cssRules.length)
    sheet.insertRule('.settings label {margin-left: 3px;}', sheet.cssRules.length)
    sheet.insertRule('.settings select {width: 100%; font-size: 11px;}', sheet.cssRules.length)
    sheet.insertRule('.setting {padding: 2px 2px 0;}', sheet.cssRules.length)
    sheet.insertRule('.table-style {margin: 3px 0px 0px 3px; background: none repeat scroll 0% 0% #2B2B2B; border: 1px solid #111111;}', sheet.cssRules.length)
    sheet.insertRule('#chat_table2 {width: 754px; margin: 3px 0 0 3px; background: #2B2B2B; border: 1px solid #111111;}', sheet.cssRules.length)
    sheet.insertRule('#chat2 table tr td {padding: 0px; color: #FFFFFF; max - width: 754px; overflow - x: hidden;}', sheet.cssRules.length)
    sheet.insertRule('#clan_chat_input {width: 700px; margin: 3px 4px 0px 3px;}', sheet.cssRules.length)
    sheet.insertRule('#gemid, small.xx-small {font-size: xx-small;}', sheet.cssRules.length)
    sheet.insertRule('.left-quest-action-battle {font-size: 10px; line-height: 1em;}', sheet.cssRules.length)
    sheet.insertRule('.left-quest-action-gather {font-size: 10px; line-height: 1em;}', sheet.cssRules.length)
    sheet.insertRule('.g-green   {color: #88FF88;}', sheet.cssRules.length)
    sheet.insertRule('.d-green   {color: #00BB00;}', sheet.cssRules.length)
    sheet.insertRule('.purple    {color: #CC66CC;}', sheet.cssRules.length)
    sheet.insertRule('.yellow    {color: #FFFF00;}', sheet.cssRules.length)
    sheet.insertRule('.l-blue    {color: #CCFFFF;}', sheet.cssRules.length)
    sheet.insertRule('.blue      {color: #6666FF;}', sheet.cssRules.length)
    sheet.insertRule('.red       {color: #FF7171;}', sheet.cssRules.length)
    sheet.insertRule('.l-red     {color: #F59292;}', sheet.cssRules.length)
    sheet.insertRule('.orang     {color: #FFA550;}', sheet.cssRules.length)
    sheet.insertRule('.white     {color: #FFFFFF;}', sheet.cssRules.length)
    sheet.insertRule('.smol      {font-size: 10px;}', sheet.cssRules.length)
    sheet.insertRule('.padl2     {padding-left: 4px;}', sheet.cssRules.length)
    sheet.insertRule('.bold      {font-weight: bold;}', sheet.cssRules.length)
    sheet.insertRule('.bold      {font-weight: bold;}', sheet.cssRules.length)
    sheet.insertRule('.uncommon  {color: #00CC00;}', sheet.cssRules.length)
    sheet.insertRule('.rare      {color: #00DDDD;}', sheet.cssRules.length)
    sheet.insertRule('.epic      {color: #EEEE00;}', sheet.cssRules.length)
    sheet.insertRule('.legendary {color: #FF7711;}', sheet.cssRules.length)

    if (settings.fixedPopupHeader) {
        sheet.insertRule('#popup {overflow-y: hidden;}', sheet.cssRules.length)
        sheet.insertRule('#popup-content {overflow-y: auto; max-height: 498px;}', sheet.cssRules.length)
    }

    if (settings.permanentScrollbar) {
        sheet.insertRule('html {overflow-y: scroll;}', sheet.cssRules.length)
    }
}

function toggleHeader() {
    let header = document.getElementById("header")
    if (settings.hideHeader) {
        header.style.display = "none"
        changeChannelVisibility('chat3', 'hideHeader')
    } else {
        header.style.display = "block"
        changeChannelVisibility('chat3', 'hideHeader')
    }
}

function toggleEnterRift() {
    let enterRift = document.getElementById("enterRift")
    if (settings.enterRift)
        enterRift.style.display = "table-row"
    else
        enterRift.style.display = "none"
}

function cacheClanMember() {
    return new Promise(function (resolve, reject) {
        $.post('clan.php', { mod: 'members' }, function (data) {
            let regex = /javascript:clanViewMember\(\d+\)">(.*?)</g
            let matches = []
            while (matches = regex.exec(data.v)) {
                hextClanMemberCache.push(matches[1])
            }
            resolve("Clan cache initiliazed")
        }, 'json');
    });
}

function applyInjections() {
    var script = document.createElement("script")
    script.innerHTML = `
riftSoon = false
riftActive = false

function displayAutosRemaining(autos, fatigue) {
    if (fatigue == 1 && autos > 0) {
        if (riftSoon)
            document.title = '[RS] (R' + autos + ') Heroes RPG'
        else if (riftActive)
            document.title = '[RIFT] (R' + autos + ') Heroes RPG'
        else
            document.title = '(R' + autos + ') Heroes RPG'
    } else if (autos >= 0 && fatigue != 1) {
        if (riftSoon)
            document.title = '[RS] (' + autos + ') Heroes RPG'
        else if (riftActive)
            document.title = '[RIFT] (' + autos + ') Heroes RPG'
        else
            document.title = '(' + autos + ') Heroes RPG'
    } else {
        document.title = '(AUTOS EXPIRED) Heroes RPG'
    }

    var acol
    var disvar
    if (fatigue == 1) {
        acol = 'FF3333'
        disvar = 'Reserve Autos'
    } else {
        disvar = 'Autos'
        if (autos > 20)
            acol = '33FF33'
        else
            acol = 'FFFF33'
    }

    return '<div style="color: #' + acol + '; text-align: center">' + autos + ' ' + disvar + ' Remaining</div>'
}

cmdFlags = {dh: false, stats: false, skills: false}

function send_chat_command(command) {
    cmdFlags[command] = true
    $.post('chat.php', {mod:'send', msg:'/'+command}, function(data) {
        if(!data.err) {
            if(data.addignore)
                ignored.push(data.addignore)
            if(data.remignore)
                ignored.splice(ignored.indexOf(data.remignore, 1))
            chatinactivity = 0
            update_chat(0)
        } else {
            console.log(data.err)
        }
    }, 'json');
}

function updateQuestPoints() {
    $.post('upgrade.php', {mod:'qp'}, function(data) {
        let qpElement = document.getElementById('ext_a_qp')
        if(qpElement) {
            let result = data.v.match(/id="upg_qp">([\\d,]+)<\\/span>/)
            if(result)
                qpElement.textContent = result[1]
            else
                qpElement.textContent = ""
        }
    }, 'json');
}

function getSkillCost(id) {
    return new Promise(function(resolve, reject) {
        $.post('skills.php', {mod:'train', id:id, confirm:0}, function(data) {
            if(!data.err) {
                let match1 = data.html.match(/Train 1x<\\/a> \\(([\\d,]+) SP\\)/)
                let match2 = data.html.match(/Train 10x<\\/a> \\(([\\d,]+) SP\\)/)
                if(match1 && match2)
                    resolve({id: id, cost1: match1[1], cost10: match2[1], html: data.html})
                else
                    resolve("No train cost found: player level is too low")
            } else {
                resolve(data.err) //There is problem as Promise.all fails when we get reject and I don't want to write some Promise.any function so I'll just pass it as resolve
            }
        }, 'json');
    });
}

hextPlayerClanId = null

function cachePlayerClanId() {
    if(hextPlayerClanId === null) {
        let playerId = $('#s_cname > a').attr('href')
        let match = playerId.match(/javascript:viewPlayer\\((\\d+)\\)/)
        if(match) playerId = match[1]

        if(typeof playerId !== "undefined") {
            $.post('misc.php', {mod:'viewplayer', id:playerId, type:1}, function(data) {
                let match = data.v.match(/href="javascript:viewClan\\((\\d+)\\)">(.+)<\\/a>/)
                if(match)
                    hextPlayerClanId = match[1]
                else
                    hextPlayerClanId = null
            }, 'json');
        }
    }
}

function viewClanProfile() {
    showPopup()

    if(hextPlayerClanId !== null) {
        $.post('misc.php', {mod:'viewclan', id:hextPlayerClanId}, function(data) {
            $('#popup-title').html('Clan Profile')
            $('#popup-content').html(data.v)
            $('#popup-content').append('<br><br>[<a href="javascript:clan()">Back</a>]')
        }, 'json');
    }
}

let updateStatsTimeout = null
equip = (function() {
    let parent_function = equip
    return function() {
        parent_function.apply(this, arguments)
        if(updateStatsTimeout !== null)
            clearTimeout(updateStatsTimeout)
        updateStatsTimeout = setTimeout(send_chat_command.bind(null, 'stats'), 1000)
    };
})();

equipAccessory = (function() {
    let parent_function = equipAccessory
    return function() {
        parent_function.apply(this, arguments)
        if(updateStatsTimeout !== null)
            clearTimeout(updateStatsTimeout)
        updateStatsTimeout = setTimeout(send_chat_command.bind(null, 'stats'), 1000)
    };
})();
`
    document.body.appendChild(script)
}