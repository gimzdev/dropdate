<div align="center">

# Dropdate

Game releases and esports tournaments in one calendar, with a free API.

[dropdate.net](https://dropdate.net) · [API](https://dropdate.net/docs) · Next.js · TypeScript · PostgreSQL

</div>

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

| | |
|---|---|
| **Feeds** | This week, most anticipated, just released: games and tournaments by day |
| **Games** | Dates, artwork and critic scores; plain-English search, platform and genre filters |
| **Esports** | Live and upcoming tournaments with dates and prize pools |
| **Accounts** | Wishlist and games played, each markable as completed |
| **Calendar sync** | Any view in Google, Apple or Outlook calendars, following dates as they move |
| **Free API** | JSON or iCalendar, no key ([docs](https://dropdate.net/docs)) |

```
GET /api/events?q=ps5%20releases%20next%20month&limit=10
GET /api/calendar.ics?type=release&q=xbox
```

| Data | From |
|---|---|
| Games | IGDB, Steam |
| Tournaments | PandaScore |
| Accounts | PostgreSQL |

<sub>Names and images belong to their owners.</sub>
