

## Tatizo

Mwanafunzi anapobonyeza "Set Up Authenticator" na QR code inaonekana, lakini hawaelewi wazi kwamba wanahitaji:
1. Kutumia app tofauti kwenye simu (Google Authenticator/Authy) kuscan QR hiyo
2. App hiyo ndio itakayotengeneza msimbo wa tarakimu 6
3. Kisha waandike msimbo huo kwenye sehemu ya verification

Pia kuna hatari ya kiufundi: secret inawekwa kwenye database KABLA ya verification - kama mtumiaji akiacha bila kuthibitisha, secret ipo lakini haijathibitishwa.

## Mpango

### 1. Boresha maelekezo ya UI kwenye TotpSetup.tsx
- Ongeza hatua za wazi (step-by-step) zinazomwelekeza mtumiaji:
  - **Hatua 1**: "Pakua Google Authenticator au Authy kwenye simu yako" (na link za Play Store/App Store)
  - **Hatua 2**: "Fungua app na scan QR code hii" 
  - **Hatua 3**: "App itaonyesha msimbo wa tarakimu 6 unaobadilika kila sekunde 30 - andika msimbo huo hapa chini"
- Ongeza icon/badge za Google Authenticator na Authy kama visual cues

### 2. Sasisha i18n translations
- Ongeza tafsiri mpya za Kiswahili na Kiingereza kwa maelekezo mapya ya hatua kwa hatua

### 3. Ongeza unverified secret handling kwenye edge function
- Badilisha setup-totp: hifadhi secret kama `totp_pending_secret` badala ya `totp_secret` moja kwa moja
- Kwenye verify-setup: hamisha kutoka `totp_pending_secret` kwenda `totp_secret` baada ya verification kufanikiwa
- Hii inazuia hali ambapo secret ipo lakini haijathibitishwa

**Au** (rahisi zaidi): Weka tu maelekezo bora ya UI bila kubadilisha backend logic, kwani mtiririko wa sasa unafanya kazi kisahihi - tatizo kuu ni UX clarity.

### Faili zitakazohaririwa
- `src/components/TotpSetup.tsx` - maelekezo bora ya hatua kwa hatua
- `src/lib/i18n.tsx` - tafsiri mpya

