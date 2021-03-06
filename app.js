// This loads the environment variables from the .env file
require('dotenv-extended').load();

const builder = require('botbuilder'),
    emotionService = require('./emotion-service'),
    needle = require("needle"),
    restify = require('restify'),
    url = require('url');
    validUrl = require('valid-url'),
    request = require('request').defaults({ encoding: null }),
    oxfordEemotion = require("node-oxford-emotion")(process.env.MICROSOFT_EMOTION_API_KEY);

//=========================================================
// Bot Setup
//=========================================================
// Setup Restify Server
const server = restify.createServer();
server.listen(process.env.port || process.env.PORT || 3978, function () {
    console.log('%s listening to %s', server.name, server.url);
});

// Create chat bot
const connector = new builder.ChatConnector({
    appId: process.env.MICROSOFT_APP_ID,
    appPassword: process.env.MICROSOFT_APP_PASSWORD
});

const bot = new builder.UniversalBot(connector);
server.post('/api/messages', connector.listen());

// LUIS
const model = process.env.LUIS_MODEL;
const recognizer = new builder.LuisRecognizer(model);
var intents = new builder.IntentDialog({ recognizers: [recognizer] });

// Setup intents 
bot.endConversationAction('goodbye', 'Goodbye :)', { matches: /^goodbye|bye|see you|end|stop/i }); 
bot.beginDialogAction('help', '/help', { matches: /^help|home|stuck/i }); 

bot.dialog('/', intents);
intents.matches('None', '/help')
.matches('greeting', '/greeting')
.matches('thank', builder.DialogAction.send(":)"))
.matches(/^awesome|cool|great/i, builder.DialogAction.send("I know right!"))
.matches('about', '/about')
.matches('play', '/play')
.onDefault(builder.DialogAction.send("I'm sorry. I didn't understand."))

//=========================================================
// Bots Events
//=========================================================
//Sends greeting message when the bot is first added to a conversation
bot.on('conversationUpdate', message => {
    if (message.membersAdded) {
        message.membersAdded.forEach(identity => {
            if (identity.id === message.address.bot.id) {
                const reply = new builder.Message()
                    .address(message.address)
                    .text("Hi! I am Sweet Bot, welcome to the Microsoft stand here at Bot World. I can understand your emotions and if you play a game with me, you'll get a sweet! Ask me about the game :)");
                bot.send(reply);
            }
        });
    }
});

//=========================================================
// Bot Dialogs
//=========================================================
bot.dialog('/greeting', session => {
        new Promise(
        (resolve, reject) => {
            const requestData = {
                url: "https://sweetbot.azure-api.net/api/values/1",
                headers: { 
                    'content-type': 'application/json',
                    'Ocp-Apim-Subscription-Key': process.env.SWEETBOT_API_KEY                 
                },
                json: { "user": session.message.user.name}
            };

            request.put(requestData, (error, response, body) => {
                if (error) {
                    reject(error);
                }
                else if (response.statusCode != 200) {
                    reject(body);
                }
                else {
                    resolve(body);
                }
            });
        }
    );

    session.endDialog("Hey " + session.message.user.name + " :)");
});

bot.dialog('/help', session => {
    session.endDialog("* start - starts the game \n* give me more - to keep playing \n* about - gives you information about this game \n* help - Displays these commands.");
});

bot.dialog('/about', session => {
    session.send("The game is about guessing your emotions (don't worry! we do not store the photos). We use the Microsoft Emotions API to do this. If you want to play, let me know and I'll give you the emotion you need to act out, all you'll have to do is take a picture and send it to me.");
    session.endDialog("If you act out the correct emotion I will fire a request to the lovely sweet machine at the Microsoft Stand and you will get a sweet!");
});

bot.dialog('/play', [
    function (session) {
        var randNum = Math.floor(Math.random() * emotionList.length);
        session.userData.emotionSelected = emotionList[randNum];
        builder.Prompts.text(session, "Send me a picture showing the emotion '" + emotionList[randNum] + "'. Try sending me an image or an image URL");
    },

    function (session){
        if (hasImageAttachment(session)) {
            if (isSkypeAttachment(session.message.attachments[0])) {
                
                //////////////////////////////////////    SKYPE IMAGE STREAM PROBLEM     ////////////////////////////////////////////////

                var stream = getImageStreamFromUrl(session.message.attachments[0]);

                // var bitmap = fs.readFileSync(stream);
                // var imageData = new Buffer(bitmap.toString('binary'),'binary');
                  
                // var emotion = oxfordEmotion.recognize("image", stream, function(cb) {
                //     console.log(cb);
                // });


                emotionService
                    .getEmotionFromStream(stream)
                    .then(caption => handleSuccessResponse(session, caption))
                    .catch(error => handleErrorResponse(session, error));

                 //////////////////////////////////////    SKYPE IMAGE STREAM PROBLEM     ////////////////////////////////////////////////

            }else{  
                var imgUrl = session.message.attachments[0].contentUrl;
                emotionService
                    .getEmotionFromUrl(imgUrl)
                    .then(emotion => handleSuccessResponse(session, emotion))
                    .catch(error => handleErrorResponse(session, error));
            }
        }
        else if(imageUrl = (parseAnchorTag(session.message.text) || (validUrl.isUri(session.message.text)? session.message.text : null))) {
            emotionService
                .getEmotionFromUrl(imageUrl)
                .then(emotion => handleSuccessResponse(session, emotion))
                .catch(error => handleErrorResponse(session, error));
        }
        else {
            session.send("Did you upload an image? I'm more of a visual person. Try sending me an image or an image URL");
            session.beginDialog('/play');
        }      
    }
]);


//=========================================================
// Utilities
//=========================================================
const emotionList = [
    "anger", 
    "contempt", 
    "disgust",
    "fear",
    "happiness",
    "neutral",
    "sadness",
    "surprise"
];

const hasImageAttachment = session => {
    return ((session.message.attachments.length > 0) && (session.message.attachments[0].contentType.indexOf("image") !== -1));
}

const getImageStreamFromUrl = attachment => {
    var headers = {};
    if (isSkypeAttachment(attachment)) {
        connector.getAccessToken((error, token) => {
            var tok = token;
            headers['Authorization'] = 'Bearer ' + token;
            headers['Content-Type'] = 'application/octet-stream';

            return needle.get(attachment.contentUrl, { headers: headers });
        });
    }

    headers['Content-Type'] = attachment.contentType;
    return needle.get(attachment.contentUrl, { headers: headers });
}

const isSkypeAttachment = attachment => {
    if (url.parse(attachment.contentUrl).hostname.substr(-"skype.com".length) == "skype.com") {
        return true;
    }

    return false;
}

/**
 * Gets the href value in an anchor element.
 * Skype transforms raw urls to html. Here we extract the href value from the url
 */
const parseAnchorTag = input => {
    var match = input.match("^<a href=\"([^\"]*)\">[^<]*</a>$");
    if(match && match[1]) {
        return match[1];
    }

    return null;
}

//=========================================================
// Response Handling
//=========================================================
const handleSuccessResponse = (session, emotion) => {
    if (emotion) {
        if(emotion == session.userData.emotionSelected){
            session.endDialog("Nice! That's definitely " + emotion + ". I'll speak to that machine and make sure you get something sweet :)");

            // API call to Paul's sweet dispenser
            new Promise(
                (resolve, reject) => {
                    const requestData = {
                        url: "https://sweetbot.azure-api.net/api/values/add",
                        headers: { 'Ocp-Apim-Subscription-Key': process.env.SWEETBOT_API_KEY }
                    };

                    request.get(requestData, (error, response, body) => {
                        if (error) {
                            reject(error);
                        }
                        else if (response.statusCode != 200) {
                            reject(body);
                        }
                        else {
                            resolve(body);
                        }
                    });
                }
            );


        }
        else {
            session.endDialog("I think that emotion is " + emotion + ". I was looking for some thing more along the lines of " + session.userData.emotionSelected + ". Let's try something else!");
            session.beginDialog('/play');
        }
    }
    else {
        session.send("Woops! I couldn't pick out an emotion from that picture :(");
    }
}

const handleErrorResponse = (session, error) => {
    session.send("Oops! Something went wrong. Try again later.");
    console.error(error);
}