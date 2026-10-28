# Data tools

This page backs up the hub's data to a file, can write a backup into another copy of the hub, and tidies Sundays that were saved more than once. It is a technical page.

## Who can use it
- Admins of the church's core team, and master admins, can open it.
- Anyone else is told they do not have access, or not enough permissions.

## Back up the hub's data
1. In **1 · Back up**, every kind of data is ticked to start with. Untick any you do not want. **Select all / none** ticks or unticks them all.
2. Press **Back up now**.
3. A bar shows how far it has got. When it is done, one backup file downloads.
4. The **Log** at the bottom lists each kind of data and how many records it held.
- A backup only reads. Nothing is changed. It is worth doing before any big change, and every so often anyway.

## Check a restore first (dry run)
1. In **2 · Restore or copy**, fill in **Target project** with the two values for the copy of the hub you want to write into. A technical admin will know these.
2. Under **Backup file**, choose a backup file. The page says how many records it holds, where it came from and when it was taken.
3. Press **Dry run**. The **Log** lists what would be written. Nothing is written.

## Restore or copy a backup
1. Do the steps above.
2. Press **Write to target** and say yes to the question.
3. If the target is the live hub, you are asked a second time. Only say yes if you really mean to restore over live data.
4. The **Log** says how many records were written, and if anything failed.

## Tidy duplicate dates
1. In **3 · Tidy duplicate dates**, press **Find duplicates**.
2. The page lists each date that has more than one copy. Each copy is marked **has people** or **empty**.
3. If a date has one copy with people and some empty ones, press **Archive the empty copies** and say yes. This deals with all such dates at once.
4. If more than one copy has people on it, the date says **needs you to choose**. Press **Keep this one** on the right copy and say yes. The other copies are archived.

## Good to know
- Restoring writes over records that match the backup. It never deletes anything.
- Always try a restore on a test copy of the hub first, unless you are deliberately restoring the live one.
- Tidying never deletes. Archived copies disappear from the rota and the planner, and can be brought back.
- **Clear** empties the log on screen only.

## Who to ask
- A master admin, or whoever looks after the hub's technical side.
