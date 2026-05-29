/**
 * Steam Key Checker
 * 
 * Sprawdza klucze Steam poprzez Steam Store API.
 * 
 * UWAGA: Steam NIE posiada API do sprawdzania kluczy BEZ ich aktywacji.
 * Ten skrypt AKTYWUJE prawidlowe klucze na Twoim koncie!
 * Uzywaj oddzielnego konta do testowania jesli nie chcesz aktywowac kluczy.
 * 
 * Wymaga: sessionid i steamLoginSecure cookies z przegladarki.
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// ============ KOLORY W KONSOLI ============
const colors = {
    red: (text) => `\x1b[31m${text}\x1b[0m`,
    green: (text) => `\x1b[32m${text}\x1b[0m`,
    yellow: (text) => `\x1b[33m${text}\x1b[0m`,
    cyan: (text) => `\x1b[36m${text}\x1b[0m`,
    gray: (text) => `\x1b[90m${text}\x1b[0m`,
    bold: (text) => `\x1b[1m${text}\x1b[0m`,
};

// ============ KONFIGURACJA (wartosci domyslne) ============
// Mozna je nadpisac w config.json w sekcji "settings"
const CONFIG = {
    // Opoznienie miedzy requestami (ms) - chroni przed banem IP
    delayBetweenKeys: 5000,       // 5 sekund miedzy kluczami
    delayOnRateLimit: 3600000,    // 60 minut jesli rate limit (Steam blokuje na ~1h!)
    maxRetries: 3,                 // max prob na klucz
    retryDelay: 10000,             // 10 sek miedzy probami
    autoConfirm: false,            // true = nie pyta o potwierdzenie
    keysFile: 'keys.txt',
    resultsFile: 'results.txt',
    configFile: 'config.json',
};

// ============ STATUS KLUCZY ============
const KEY_STATUS = {
    VALID: 'valid',         // Klucz dziala (zostal aktywowany!)
    INVALID: 'invalid',     // Klucz nieprawidlowy
    DUPLICATE: 'duplicate', // Klucz juz uzyty
    OWNED: 'owned',         // Juz posiadasz ta gre
    REGION: 'region',       // Blokada regionalna
    RATE_LIMIT: 'ratelimit',// Za duzo prob
    ERROR: 'error',         // Blad
};

// ============ FUNKCJE POMOCNICZE ============

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function loadConfig() {
    const configPath = path.join(__dirname, CONFIG.configFile);
    if (!fs.existsSync(configPath)) {
        const defaultConfig = {
            sessionid: "TUTAJ_WKLEJ_SESSIONID",
            steamLoginSecure: "TUTAJ_WKLEJ_STEAMLOGINSECURE",
            settings: {
                _komentarz: "Ustaw delayBetweenKeys nizej dla szybszego sprawdzania (ms). UWAGA: ponizej 3000 ryzykujesz blokade na ~1h!",
                delayBetweenKeys: 5000,
                autoConfirm: false
            }
        };
        fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2), 'utf8');
        console.log(colors.yellow('\n[!] Utworzono plik config.json - uzupelnij dane logowania!'));
        console.log(colors.cyan('    Instrukcja:'));
        console.log(colors.gray('    1. Zaloguj sie na store.steampowered.com w przegladarce'));
        console.log(colors.gray('    2. Otworz DevTools (F12) -> Application -> Cookies'));
        console.log(colors.gray('    3. Skopiuj wartosci: sessionid i steamLoginSecure'));
        console.log(colors.gray('    4. Wklej je do config.json'));
        console.log('');
        return null;
    }
    try {
        const data = fs.readFileSync(configPath, 'utf8');
        const config = JSON.parse(data);

        // Nadpisz domyslne ustawienia tym co jest w config.json -> settings
        if (config.settings) {
            if (typeof config.settings.delayBetweenKeys === 'number') {
                CONFIG.delayBetweenKeys = config.settings.delayBetweenKeys;
            }
            if (typeof config.settings.autoConfirm === 'boolean') {
                CONFIG.autoConfirm = config.settings.autoConfirm;
            }
        }
        return config;
    } catch (e) {
        console.log(colors.red('[BLAD] Nie mozna odczytac config.json: ' + e.message));
        return null;
    }
}

function loadKeys() {
    const keysPath = path.join(__dirname, CONFIG.keysFile);
    if (!fs.existsSync(keysPath)) {
        fs.writeFileSync(keysPath, 'XXXXX-XXXXX-XXXXX\n', 'utf8');
        console.log(colors.yellow('[!] Utworzono plik keys.txt - wpisz tam klucze (jeden na linie)'));
        return [];
    }
    const data = fs.readFileSync(keysPath, 'utf8');
    const keys = data
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0 && !line.startsWith('#') && !line.startsWith('//'));
    
    return keys;
}

function saveResult(key, status, details) {
    const resultsPath = path.join(__dirname, CONFIG.resultsFile);
    const timestamp = new Date().toLocaleString('pl-PL');
    const line = `[${timestamp}] ${key} - ${status} - ${details}\n`;
    fs.appendFileSync(resultsPath, line, 'utf8');
}

// ============ STEAM API ============

function registerKey(key, config) {
    return new Promise((resolve, reject) => {
        const postData = `product_key=${encodeURIComponent(key)}&sessionid=${encodeURIComponent(config.sessionid)}`;

        const options = {
            hostname: 'store.steampowered.com',
            port: 443,
            path: '/account/ajaxregisterkey/',
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'Content-Length': Buffer.byteLength(postData),
                'Cookie': `sessionid=${config.sessionid}; steamLoginSecure=${config.steamLoginSecure}`,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/json, text/plain, */*',
                'X-Requested-With': 'XMLHttpRequest',
                'Referer': 'https://store.steampowered.com/account/registerkey',
                'Origin': 'https://store.steampowered.com',
            },
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    // Sprawdz czy dostalismy rate limit (HTTP 429) lub blad serwera
                    if (res.statusCode === 429) {
                        resolve({ status: KEY_STATUS.RATE_LIMIT, details: 'Too Many Requests' });
                        return;
                    }
                    if (res.statusCode !== 200) {
                        resolve({ status: KEY_STATUS.ERROR, details: `HTTP ${res.statusCode}` });
                        return;
                    }

                    const json = JSON.parse(data);
                    resolve(parseResponse(json, key));
                } catch (e) {
                    resolve({ status: KEY_STATUS.ERROR, details: `Parse error: ${e.message}` });
                }
            });
        });

        req.on('error', (e) => {
            reject(e);
        });

        req.setTimeout(30000, () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });

        req.write(postData);
        req.end();
    });
}

function parseResponse(json, key) {
    /*
     * Steam purchase_result_details:
     * 0  = Success (klucz aktywowany!)
     * 9  = Already own this game
     * 13 = Not available in your region
     * 14 = Invalid key
     * 15 = Duplicate key (juz wykorzystany)
     * 24 = Missing required ownership (potrzebna baza gra)
     * 36 = Requires PS Plus
     * 53 = Too many recent activations (rate limit)
     */
    
    const success = json.success || 0;
    const detail = json.purchase_result_details;

    if (success === 1) {
        // Klucz prawidlowy i AKTYWOWANY
        let gameName = '';
        if (json.purchase_receipt_info && json.purchase_receipt_info.line_items) {
            gameName = json.purchase_receipt_info.line_items
                .map(item => item.line_item_description)
                .join(', ');
        }
        return {
            status: KEY_STATUS.VALID,
            details: gameName || 'Aktywowano pomyslnie!',
        };
    }

    switch (detail) {
        case 9:
            return { status: KEY_STATUS.OWNED, details: 'Juz posiadasz ta gre' };
        case 13:
            return { status: KEY_STATUS.REGION, details: 'Niedostepny w Twoim regionie' };
        case 14:
            return { status: KEY_STATUS.INVALID, details: 'Nieprawidlowy klucz' };
        case 15:
            return { status: KEY_STATUS.DUPLICATE, details: 'Klucz juz wykorzystany' };
        case 24:
            return { status: KEY_STATUS.INVALID, details: 'Wymagana baza gry' };
        case 36:
            return { status: KEY_STATUS.INVALID, details: 'Wymaga PS Plus' };
        case 53:
            return { status: KEY_STATUS.RATE_LIMIT, details: 'Za duzo aktywacji - poczekaj' };
        default:
            return { status: KEY_STATUS.ERROR, details: `Nieznany kod: ${detail} (success: ${success})` };
    }
}

// ============ WYSWIETLANIE WYNIKOW ============

function printResult(key, result, index, total) {
    const prefix = colors.gray(`[${index}/${total}]`);

    switch (result.status) {
        case KEY_STATUS.VALID:
            console.log(`${prefix} ${colors.green(`${key} - Dziala!! (${result.details})`)}`);
            break;
        case KEY_STATUS.OWNED:
            console.log(`${prefix} ${colors.yellow(`${key} - Juz posiadasz (${result.details})`)}`);
            break;
        case KEY_STATUS.DUPLICATE:
            console.log(`${prefix} ${colors.red(`${key} - Nie dziala (${result.details})`)}`);
            break;
        case KEY_STATUS.INVALID:
            console.log(`${prefix} ${colors.red(`${key} - Nie dziala (${result.details})`)}`);
            break;
        case KEY_STATUS.REGION:
            console.log(`${prefix} ${colors.yellow(`${key} - Blokada regionalna`)}`);
            break;
        case KEY_STATUS.RATE_LIMIT:
            console.log(`${prefix} ${colors.yellow(`${key} - Rate limit, czekam...`)}`);
            break;
        case KEY_STATUS.ERROR:
            console.log(`${prefix} ${colors.red(`${key} - BLAD: ${result.details}`)}`);
            break;
    }
}

// ============ GLOWNA LOGIKA ============

async function checkKey(key, config, retryCount = 0) {
    try {
        const result = await registerKey(key, config);
        
        // Jesli rate limit - czekaj i probuj ponownie
        if (result.status === KEY_STATUS.RATE_LIMIT && retryCount < CONFIG.maxRetries) {
            console.log(colors.yellow(`    -> Rate limit! Czekam ${CONFIG.delayOnRateLimit / 1000}s...`));
            await sleep(CONFIG.delayOnRateLimit);
            return checkKey(key, config, retryCount + 1);
        }

        return result;
    } catch (e) {
        if (retryCount < CONFIG.maxRetries) {
            console.log(colors.gray(`    -> Blad sieci, ponawiam za ${CONFIG.retryDelay / 1000}s...`));
            await sleep(CONFIG.retryDelay);
            return checkKey(key, config, retryCount + 1);
        }
        return { status: KEY_STATUS.ERROR, details: e.message };
    }
}

async function main() {
    console.log('');
    console.log(colors.bold('==========================================='));
    console.log(colors.bold('       STEAM KEY CHECKER v1.0'));
    console.log(colors.bold('==========================================='));
    console.log('');
    console.log(colors.yellow('UWAGA: Ten skrypt AKTYWUJE prawidlowe klucze na Twoim koncie!'));
    console.log(colors.yellow('Jesli chcesz TYLKO sprawdzic - uzywaj oddzielnego konta Steam.'));
    console.log('');

    // Wczytaj konfiguracje
    const config = loadConfig();
    if (!config) {
        process.exit(1);
    }
    if (config.sessionid === 'TUTAJ_WKLEJ_SESSIONID' || config.steamLoginSecure === 'TUTAJ_WKLEJ_STEAMLOGINSECURE') {
        console.log(colors.red('[BLAD] Uzupelnij config.json danymi logowania!'));
        console.log(colors.gray('       Instrukcja w pliku config.json'));
        process.exit(1);
    }

    // Wczytaj klucze
    const keys = loadKeys();
    if (keys.length === 0) {
        console.log(colors.red('[BLAD] Brak kluczy w keys.txt!'));
        process.exit(1);
    }

    console.log(colors.cyan(`Znaleziono ${keys.length} kluczy do sprawdzenia.`));
    console.log(colors.gray(`Opoznienie miedzy kluczami: ${CONFIG.delayBetweenKeys / 1000}s`));
    if (CONFIG.delayBetweenKeys < 3000) {
        console.log(colors.red('[!] UWAGA: tempo ponizej 3s grozi blokada aktywacji na ~1h!'));
    }
    const szacowanyCzas = Math.ceil((keys.length * CONFIG.delayBetweenKeys) / 1000);
    console.log(colors.gray(`Szacowany czas: ~${Math.floor(szacowanyCzas / 60)}min ${szacowanyCzas % 60}s`));
    console.log('');

    // Potwierdzenie (mozna pominac ustawiajac autoConfirm: true w config.json)
    if (!CONFIG.autoConfirm) {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        const answer = await new Promise(resolve => {
            rl.question(colors.yellow('Rozpoczac sprawdzanie? (t/n): '), resolve);
        });
        rl.close();

        if (answer.toLowerCase() !== 't' && answer.toLowerCase() !== 'y') {
            console.log(colors.gray('Anulowano.'));
            process.exit(0);
        }
    }

    console.log('');
    console.log(colors.cyan('--- Rozpoczynam sprawdzanie ---'));
    console.log('');

    // Statystyki
    let stats = { valid: 0, invalid: 0, duplicate: 0, owned: 0, region: 0, error: 0 };

    // Sprawdzaj klucze
    for (let i = 0; i < keys.length; i++) {
        const key = keys[i];

        // Walidacja formatu klucza
        if (!/^[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}(-[A-Z0-9]{5})?$/i.test(key)) {
            console.log(colors.gray(`[${i + 1}/${keys.length}] ${key} - Pominiety (nieprawidlowy format)`));
            continue;
        }

        const result = await checkKey(key, config);
        printResult(key, result, i + 1, keys.length);
        saveResult(key, result.status, result.details);

        // Aktualizuj statystyki
        switch (result.status) {
            case KEY_STATUS.VALID: stats.valid++; break;
            case KEY_STATUS.INVALID: stats.invalid++; break;
            case KEY_STATUS.DUPLICATE: stats.duplicate++; break;
            case KEY_STATUS.OWNED: stats.owned++; break;
            case KEY_STATUS.REGION: stats.region++; break;
            default: stats.error++; break;
        }

        // Opoznienie miedzy kluczami (oprocz ostatniego)
        if (i < keys.length - 1) {
            // Losowe dodatkowe opoznienie 0-2s zeby wyglondac bardziej naturalnie
            const jitter = Math.floor(Math.random() * 2000);
            await sleep(CONFIG.delayBetweenKeys + jitter);
        }
    }

    // Podsumowanie
    console.log('');
    console.log(colors.bold('==========================================='));
    console.log(colors.bold('           PODSUMOWANIE'));
    console.log(colors.bold('==========================================='));
    console.log(colors.green(`  Dzialajace (aktywowane): ${stats.valid}`));
    console.log(colors.yellow(`  Juz posiadane:           ${stats.owned}`));
    console.log(colors.red(`  Nieprawidlowe:           ${stats.invalid}`));
    console.log(colors.red(`  Juz wykorzystane:        ${stats.duplicate}`));
    console.log(colors.yellow(`  Blokada regionalna:      ${stats.region}`));
    console.log(colors.gray(`  Bledy:                   ${stats.error}`));
    console.log(colors.bold('==========================================='));
    console.log(colors.gray(`Szczegoly zapisano w: ${CONFIG.resultsFile}`));
    console.log('');
}

main().catch(err => {
    console.error(colors.red(`[FATAL] ${err.message}`));
    process.exit(1);
});
