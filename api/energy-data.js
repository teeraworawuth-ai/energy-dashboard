const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');

module.exports = async (req, res) => {
    // These variables will be set in Vercel Environment Variables
    const sheetId = process.env.GOOGLE_SHEET_ID;
    const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
    // Replace literal \n in private key to actual newlines (Vercel env var formatting quirk)
    const privateKey = process.env.GOOGLE_PRIVATE_KEY ? process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n') : '';

    if (!sheetId || !clientEmail || !privateKey) {
        return res.status(500).json({ error: "Missing Google Sheets credentials in Environment Variables." });
    }

    try {
        const serviceAccountAuth = new JWT({
            email: clientEmail,
            key: privateKey,
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });

        const doc = new GoogleSpreadsheet(sheetId, serviceAccountAuth);
        await doc.loadInfo();

        const sheet = doc.sheetsByIndex[0];
        const rows = await sheet.getRows();
        
        const results = rows.map(row => {
            const data = row.toObject();
            return {
                time: data.Timestamp,
                location: data.Location,
                building: data.Building,
                room: data.Room,
                amp: parseFloat(data.Amp || 0),
                volt: parseFloat(data.Volt || 0),
                watt: parseFloat(data.Watt || 0)
            };
        });
        
        res.status(200).json(results);
    } catch (error) {
        console.error("Error fetching from Google Sheets:", error);
        res.status(500).json({ error: "Failed to fetch data", details: error.message });
    }
};
