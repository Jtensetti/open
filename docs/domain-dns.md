# Anslut open.tensetti.io

Domänen är registrerad för ÖPPNA-piloten hos värdtjänsten och väntar på DNS-verifiering. Lägg följande poster i DNS-zonen för `tensetti.io`:

| Typ | Namn i zonen | Värde |
| --- | --- | --- |
| CNAME | `open` | `custom-domains.chatgpt.site.` |
| TXT | `_openai-site-verification.open` | `openai-site-verification=idXnWaANAyF4BhftFKvyEhDmZI-NK22mw7rpZFk50IU` |
| TXT | `_cf-custom-hostname.open` | `636bf6e7-4d76-4ffa-ac97-3390fbe3d2a9` |

DNS-verktyg som kräver hela namnet ska ha `.tensetti.io` efter respektive namn. En CNAME kan inte ligga parallellt med en befintlig A/AAAA-post på samma namn. Kontrollera eventuell befintlig användning innan den ändras.

När verifiering och TLS är klara kan domänen börja fungera. Kopplingen ändrar inte pilotens åtkomstinställningar: den är fortfarande privat för ägaren. Att publicera den för externa pilotdeltagare är ett separat åtkomstbeslut.
