# Steam Key Checker v1.0

Narzedzie do sprawdzania kluczy Steam hurtowo. Wyswietla wyniki kolorowo w konsoli.

## WAZNE

**Steam NIE posiada API do sprawdzania kluczy bez ich aktywacji!**
Jesli klucz jest prawidlowy - zostanie AKTYWOWANY na Twoim koncie.

Jesli chcesz tylko sprawdzic czy klucze dzialaja bez aktywacji na glownym koncie - 
uzyj **oddzielnego konta Steam** do testowania.

## Wymagania

- Node.js 14+ (nie wymaga zadnych dodatkowych paczek npm!)
- Konto Steam zalogowane w przegladarce

## Instalacja i uruchomienie

```bash
# 1. Wejdz do folderu
cd steam-key-checker

# 2. Uruchom skrypt (za pierwszym razem utworzy config.json)
node index.js

# 3. Uzupelnij config.json (instrukcja nizej)

# 4. Wpisz klucze do keys.txt

# 5. Uruchom ponownie
node index.js
```

## Konfiguracja (config.json)

Musisz podac cookies z przegladarki:

1. Zaloguj sie na https://store.steampowered.com
2. Otworz DevTools: **F12** -> zakladka **Application** (Chrome) lub **Storage** (Firefox)
3. Przejdz do **Cookies** -> `https://store.steampowered.com`
4. Skopiuj wartosci:
   - `sessionid` - krotki string
   - `steamLoginSecure` - dlugi string z Twoim Steam ID

Wklej je do `config.json`:
```json
{
    "sessionid": "abc123def456",
    "steamLoginSecure": "76561198012345678||eyAidHlwIjogIkpXVCIs..."
}
```

## Format keys.txt

Wpisz klucze po jednym w kazdej linii:
```
KSJ7-DKSM-APWD
KSMR-544K-SDKD
ABCD-EFGH-IJKL
```

Linie zaczynajace sie od `#` lub `//` sa ignorowane (komentarze).

## Kolory wynikow

- 🟢 **Zielony** - Klucz DZIALA (i zostal aktywowany na koncie!)
- 🟡 **Zolty** - Juz posiadasz te gre / blokada regionalna
- 🔴 **Czerwony** - Klucz nie dziala (nieprawidlowy lub juz uzyty)

## Zabezpieczenia przed banem

- 5 sekund przerwy miedzy kazdym kluczem
- Losowy jitter 0-2s (wyglada naturalniej)
- Automatyczne czekanie 60s przy rate limit
- Max 3 proby na klucz przy bledach sieci
- Wyniki zapisywane do `results.txt` (mozna wznowic)

## Kody bledow Steam

| Kod | Znaczenie |
|-----|-----------|
| 0   | Sukces - aktywowano |
| 9   | Juz posiadasz ta gre |
| 13  | Niedostepne w Twoim regionie |
| 14  | Nieprawidlowy klucz |
| 15  | Klucz juz wykorzystany |
| 24  | Wymagana baza gry (np. DLC bez gry) |
| 53  | Za duzo aktywacji - rate limit |

## Pliki

- `index.js` - glowny skrypt
- `config.json` - dane logowania (NIE UDOSTEPNIAJ!)
- `keys.txt` - klucze do sprawdzenia
- `results.txt` - wyniki sprawdzania (tworzony automatycznie)
