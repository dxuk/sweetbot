const request = require('request').defaults({ encoding: null });

const EMOTION_URL = "https://api.projectoxford.ai/emotion/v1.0/recognize?subscription-key=" + process.env.MICROSOFT_EMOTION_API_KEY;

/** 
 *  Gets the emotion of the image from an image stream
 * @param {stream} stream The stream to an image.
 */
exports.getEmotionFromStream = stream => {
    return new Promise(
        (resolve, reject) => {
            const requestData = {
                url: EMOTION_URL,
                encoding: 'binary',
                headers: { 'content-type': 'application/octet-stream' }
            };

            stream.pipe(request.post(requestData, (error, response, body) => {
                if (error) {
                    reject(error);
                }
                else if (response.statusCode != 200) {
                    reject(body);
                }
                else {
                    resolve(extractEmotion(JSON.parse(body)));
                }
            }));
        }
    );
}

/** 
 * Gets the emotion of the image from an image URL
 * @param {string} url The URL to an image.
 */
exports.getEmotionFromUrl = url => {
    return new Promise(
        (resolve, reject) => {
            const requestData = {
                url: EMOTION_URL,
                json: { "url": url }
            };

            request.post(requestData, (error, response, body) => {
                if (error) {
                    reject(error);
                }
                else if (response.statusCode != 200) {
                    reject(body);
                }
                else {
                    resolve(extractEmotion(body));
                }
            });
        }
    );
}

/**
 * Extracts the emotion with the highest score
 * @param {Object} body Response of the Emotion API
 * @return {string} emotion name if found, null otherwise.
 */
const extractEmotion = body => {
    if (body) {
        for (var emotion in body[0].scores) {
            if(body[0].scores[emotion] > 0.5){
                return emotion;
            }
        }        
    }

    return null;
}
