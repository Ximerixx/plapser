const webpush = require("web-push");

const VAPID_KEYS = webpush.generateVAPIDKeys();

webpush.setVapidDetails(
    "mailto:your-email@example.com",
    VAPID_KEYS.publicKey,
    VAPID_KEYS.privateKey
);

const subscriptions = new Set();

function addSubscription(subscription) {
    subscriptions.add(subscription);
}

function notifyAll(message) {
    subscriptions.forEach(subscription => {
        webpush.sendNotification(subscription, JSON.stringify({ title: "Stream started!", body: message }))
            .catch(err => {
                console.error("Push error", err);
                subscriptions.delete(subscription);
            });
    });
}

module.exports = {
    addSubscription,
    notifyAll,
    publicKey: VAPID_KEYS.publicKey
};
