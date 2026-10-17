<div align="center">

# Dropdate

Game releases and esports tournaments in one calendar, with a free API.

[dropdate.net](https://dropdate.net) · [API](https://dropdate.net/docs) · Next.js · TypeScript · PostgreSQL

<table>
<tr>
<td align="center" width="50%"><img src="docs/screenshots/dropdate-home.png" alt="Home"><br><sub>Home</sub></td>
<td align="center" width="50%"><img src="docs/screenshots/dropdate-this-week.png" alt="This week"><br><sub>This week</sub></td>
</tr>
<tr>
<td align="center" width="50%"><img src="docs/screenshots/dropdate-calendar.png" alt="Calendar"><br><sub>Calendar</sub></td>
<td align="center" width="50%"><img src="docs/screenshots/dropdate-esports.png" alt="Esports"><br><sub>Esports</sub></td>
</tr>
</table>

<hr>

Dropdate puts every game release and esports tournament in one calendar. Search it in plain English, keep
a wishlist, and add any view to Google, Apple or Outlook calendars so it follows a game when the date
slips. It also has a free API, no key needed.

| | |
|:---|:---|
| **Feeds** | This week, most anticipated and just released, grouped by day |
| **Games** | Dates, artwork and critic scores; filters for platform and genre |
| **Esports** | Live and upcoming tournaments with dates and prize pools |
| **Accounts** | A wishlist and the games you played, each markable as completed |
| **Free API** | JSON or iCalendar, e.g. `/api/events?q=ps5 releases next month` ([docs](https://dropdate.net/docs)) |

Game data comes from IGDB and Steam, tournaments from PandaScore, and accounts live in PostgreSQL. A source
without a key is simply skipped.

<sub>Names and images belong to their owners.</sub>

</div>
