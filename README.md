<div align="center">

<h1>Dropdate</h1>

<h3>Calendar for game releases and events</h3>

[![Next.js](https://img.shields.io/badge/Next.js-000000?style=for-the-badge&logo=next.js&logoColor=white)](https://nextjs.org)
[![MongoDB](https://img.shields.io/badge/MongoDB-47A248?style=for-the-badge&logo=mongodb&logoColor=white)](https://mongodb.com)
[![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)

<hr>

<h2>About</h2>

<p>Keeping track of when games come out, when updates drop, and when tournaments start<br>
is annoying because the info is scattered across a dozen sites.<br>
Dropdate pulls all of it into one calendar.</p>

<p>Filter by platform, subscribe to specific games, and get notified<br>
when something you care about is coming up. Dates are community-submitted<br>
and verified, so the calendar stays current even for smaller titles.</p>

<hr>

<h2>Coverage</h2>

<table align="center">
<tr>
<td align="center" width="33%">

<h3>Releases</h3>

Launches<br>
DLC<br>
Updates

</td>
<td align="center" width="33%">

<h3>Competitive</h3>

Tournaments<br>
Seasons<br>
Qualifiers

</td>
<td align="center" width="33%">

<h3>Events</h3>

Betas<br>
Limited modes<br>
Collabs

</td>
</tr>
</table>

<hr>

<h2>Features</h2>

<p>Notifications via email, Discord, or browser push.<br>
Filters by platform, genre, and region.<br>
Calendar sync with Google, Apple, and Outlook.<br>
Community-submitted dates with a verification step.</p>

<hr>

<h2>API</h2>

<p>A public read-only API is available for anyone who wants to build on the calendar data.</p>

```bash
GET /api/v1/releases?days=7
GET /api/v1/events?game=valorant
GET /api/v1/search?q=tournament
```

<hr>

<h2>Self-hosting</h2>

```bash
git clone https://github.com/gimzdev/dropdate.git
cd dropdate
docker-compose up -d
```

<hr>

[![Live](https://img.shields.io/badge/Live-000000?style=for-the-badge&logo=calendar&logoColor=white)](https://dropdate.net)

</div>
