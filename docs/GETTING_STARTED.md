# Getting started: football plays as your Mac wallpaper

An animated football playbook that lives on your desktop: about 350 offensive and
defensive plays drawn like a coach's whiteboard, and if you want, played out live
with real blocking, coverage and tackling. It's a plain web page, so it needs no
installs beyond Plash, works offline, and uses very little battery.

---

## 1. Install Plash (free)

Plash is a small Mac app that shows a website as your desktop wallpaper.

1. Open the **Mac App Store** and search for **Plash** (by Sindre Sorhus), or go to
   <https://sindresorhus.com/plash>.
2. Install and open it. A small icon appears in the **menu bar** (top right of the screen).
   That icon is how you control Plash from now on.

## 2. Download the wallpaper

**Easiest (no tools):**

1. On the GitHub page for this project, click the green **Code** button, then **Download ZIP**.
2. Unzip it, and move the folder somewhere permanent, e.g. your **Documents** folder.
   (Don't leave it in Downloads if you tidy that folder; Plash needs it to stay put.)

**If you use git:**

```bash
git clone https://github.com/wfrim/football-desktop.git ~/Documents/football-desktop
```

## 3. Point Plash at it

1. Click the **Plash icon** in the menu bar, then **Add Website…**.
2. Choose the option to use a **local website / folder**, and pick the
   `football-desktop` folder you just saved (the folder itself, not a file inside it).
3. Give it a name, e.g. *Football*, and save. Within a second or two your desktop
   becomes a dark field with plays drawing themselves.

Tips:

- If the screen is black or blank, use Plash's menu, **Reload**, once.
- Plash pauses itself on battery if you turn on "Deactivate while on battery" in
  its settings. Optional; the wallpaper is light either way.

## 4. Open the settings

The wallpaper normally ignores your clicks so it never gets in the way. To change
settings:

1. Plash menu, then turn on **Browsing Mode**. Now you can click the wallpaper.
2. Click the small **"Play 001 / 354"** counter in the bottom-right corner. A
   settings sheet opens.
3. Choose anything; it's saved on your Mac automatically. Most changes start with
   the next play.
4. When you're done, turn **Browsing Mode off** again.

While Browsing Mode is on you can also **click anywhere** on the field to pause a
play. Then use **← / →** to step through it (hold Shift for bigger steps), drag the
scrubber, and click or press **Space** to continue.

---

## 5. The settings, from simplest to most advanced

Everything starts on sensible defaults. You never need to touch any of this, so
change one thing at a time and see what you like.

### Level 1: how it looks

| Setting | Choices | What it does |
|---|---|---|
| **Theme** | Night · Blueprint · Chalk · Paper · Stadium · Auto | The colour scheme. *Stadium* looks like a real field (turf, bright lines, end zones). *Auto* uses Blueprint by day and Night after dark. |
| **Brightness** | Normal · Dim | Dim is nicer late at night. |
| **Text** | Full · Title only · None | How much writing is on screen. *None* is pure art. |
| **Lines** | Precise · Hand-drawn | Hand-drawn looks like a coach's marker. |
| **Zoom** | Close · Standard · Wide | Wide shows more of the field (deep safeties, wide receivers). |

### Level 2: pace

| Setting | Choices | What it does |
|---|---|---|
| **Pace** | Extra slow · Slow · Normal · Quick | How fast plays draw. |
| **Play length** | 7 s up to 24 s | How long each finished play stays on screen. Longer is calmer, and uses even less energy. |
| **Motion** | Full · Calm · Still | *Calm* is a lower frame rate; *Still* shows finished diagrams that just fade between plays. |
| **Transition** | Fade · Rewind | *Rewind* un-draws each play before the next one. |
| **Moments** | On · Off | Small ripple rings at key moments (the catch, the handoff, the tackle). |
| **Click to pause** | On · Off | Whether clicking the wallpaper pauses it (Browsing Mode only). |

### Level 3: which plays

| Setting | Choices | What it does |
|---|---|---|
| **Playbook** | Everything · Pro · Spread · Wildcat · Power T · Wing-T · Goal line · Trick plays · Defense | Pick a whole style of football. *Trick plays* = flea flicker, reverse, Philly Special, etc. |
| **Library** | Everything · Offense · Defense · Runs · Passes · Screens & RPO | A further filter on top of the playbook. |
| **Field** | Classic · Anywhere · Red zone | *Classic* is just the play. The others put the ball at a real spot on the field, with yard numbers and end zones. |
| **Hash** | Middle · Varied | Varied snaps the ball from the left and right hash marks too. |

### Level 4: the defense

| Setting | Choices | What it does |
|---|---|---|
| **Defense** | Off · Faint · Faint + key · Bold | Show the defense behind each play. *Faint + key* highlights the defender the play is designed to beat. *Bold* draws the defense with letters, as strong as the offense. |
| **Defense ink** | Faint · Medium · Same as offense | How dark the defense is drawn. |
| **Blitz tell** | Off · On | A ripple on every blitzing defender right before the snap. |
| **Option routes** | Both · Decide | For "choice" routes: show both options, or show the tree and let the receiver pick one. |
| **Run out** | On · Off | With the defense off, ball carriers keep running instead of stopping near the line. |

### Level 5: real football

| Setting | Choices | What it does |
|---|---|---|
| **Play style** | Diagram · Lead · Live offense · Live game | *Diagram* is the classic chalkboard. *Lead* throws the ball in stride. *Live offense* moves the players. *Live game* puts 11 on 11: linemen block real defenders, corners cover, the quarterback reads the defense, and plays end in a catch, a breakup, a sack or a tackle. |
| **Defense call** | Cooperative · Competitive | *Cooperative*: the defense plays the coverage the play is designed to beat, and the offense usually wins. *Competitive*: the defense calls a play from its own playbook and anything can happen. |
| **Pursuit** | Calm · Aggressive | How hard the defense chases and how quickly blocks are shed. |
| **Play out** | Standard · To the whistle | *To the whistle* plays every snap until the tackle or touchdown, with the camera following the ball carrier. |
| **Matchup label** | On · Off | Shows the defensive call under the play name, e.g. "vs COVER 3 · NICKEL". |
| **Coach's note** | On · Off | One line explaining why the play worked or failed, e.g. "The Mike shed the right guard and made the tackle." |
| **Live defense** | Vs real offense · Diagram only | In live styles, defensive plays are run against a real offensive play. |

### Level 6: drives

| Setting | Choices | What it does |
|---|---|---|
| **Drive mode** | Off · On | Plays string together into drives: down and distance, first downs, punts, field goals and touchdowns. With *Live game*, what happens on screen decides the drive. |
| **Drive flow** | Continuous · Fade | *Continuous* scrolls the field up by the yards gained, with no blackout between plays. |

**A good "full experience" combo:** Theme *Stadium* · Play style *Live game* · Defense
call *Competitive* · Defense *Bold* · Drive mode *On* · Play out *To the whistle* ·
Play length *12 s*.

---

## Updating later

- **Downloaded the ZIP?** Download it again, replace the folder (same name, same place),
  and choose **Reload** in the Plash menu.
- **Used git?** `git pull` in the folder, then **Reload** in Plash.

Your settings are kept between updates.
