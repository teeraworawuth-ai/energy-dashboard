const crypto = require('crypto');

const accessId = process.env.TUYA_ACCESS_ID || 'yu48hrmr479rgghke9ee';
const accessKey = process.env.TUYA_ACCESS_KEY || 'cfcaba86ad2040af8955bf20d6aa006e';
const endpoint = 'https://openapi-sg.iotbing.com';

const deviceMap = {
    'A101': 'a32fdc8d3b87156738lxqt',
    'B101': 'a3b852293c4f0d75334qy1',
    'C101': 'a3689a160981c72902hiuf'
};

async function getTuyaToken() {
    const t = Date.now().toString();
    const tokenHash = crypto.createHash('sha256').update('').digest('hex');
    const stringToSign = ['GET', tokenHash, '', '/v1.0/token?grant_type=1'].join('\n');
    const sign = crypto.createHmac('sha256', accessKey).update(accessId + t + stringToSign).digest('hex').toUpperCase();

    const res = await fetch(`${endpoint}/v1.0/token?grant_type=1`, {
        headers: { client_id: accessId, sign, t, sign_method: 'HMAC-SHA256' }
    });
    const data = await res.json();
    if (!data.success) {
        // Fallback to v1 signature
        const signV1 = crypto.createHmac('sha256', accessKey).update(accessId + t).digest('hex').toUpperCase();
        const resV1 = await fetch(`${endpoint}/v1.0/token?grant_type=1`, {
            headers: { client_id: accessId, sign: signV1, t, sign_method: 'HMAC-SHA256' }
        });
        const dataV1 = await resV1.json();
        if (!dataV1.success) throw new Error("Token error: " + JSON.stringify(dataV1));
        return dataV1.result.access_token;
    }
    return data.result.access_token;
}

module.exports = async (req, res) => {
    try {
        const token = await getTuyaToken();
        const result = {};

        // Fetch status for all devices
        for (const [room, deviceId] of Object.entries(deviceMap)) {
            const t = Date.now().toString();
            const pathUri = `/v1.0/devices/${deviceId}/status`;
            const reqHash = crypto.createHash('sha256').update('').digest('hex');
            const stringToSign = ['GET', reqHash, '', pathUri].join('\n');
            const sign = crypto.createHmac('sha256', accessKey).update(accessId + token + t + stringToSign).digest('hex').toUpperCase();

            const statusRes = await fetch(`${endpoint}${pathUri}`, {
                headers: { client_id: accessId, access_token: token, sign, t, sign_method: 'HMAC-SHA256' }
            });
            const statusData = await statusRes.json();
            
            if (statusData.success && statusData.result) {
                // Find switch_1 status
                const switchStatus = statusData.result.find(s => s.code === 'switch_1');
                result[room] = {
                    connected: true,
                    state: switchStatus ? switchStatus.value : false
                };
            } else {
                result[room] = { connected: false, state: false };
            }
        }

        res.status(200).json(result);
    } catch (error) {
        console.error("Error fetching device status:", error);
        res.status(500).json({ error: error.message });
    }
};
