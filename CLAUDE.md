# Order routing take-home

`INSTRUCTIONS.md` is the only source of requirements, and the data lives in `natura-wellness-backend-test 2/`. Read only those files unless I point you at another one.

# Language

American English everywhere: code, comments, docs, commit messages, and chat.

# Working with me

Do only what I asked for. A question gets an answer, not a change, and a draft stays a draft until I approve it. Name any other change you think is worth making and let me choose.

Keep answers short, and give one recommendation rather than a menu. Before writing code, state the rules and every ambiguity you found, and wait for me to confirm them.

Never commit, push, or create a repo or gist unless I ask in that message. Before a commit, show me the exact file list.

# Scope

Part A applies the rules to the files exactly as given. `ops-notes.md` affects Part B only, so never let it change `routes.txt`.

Part B answers are my decisions. Give me the evidence and your reasoning, and label each claim as confirmed, disproved, or could not check. Before analyzing a decision, state what result would change the answer.

# Code

Keep it a small script, and add nothing the brief doesn't need.

Add a guard only for a case that occurs in the data or that a rule requires. Report each data oddity you normalize, with the order number, rather than absorbing it silently. Every order must end up routed or explicitly reported, never dropped.

A comment states only a fact the code can't show. No narration, no history, and no TODOs.

# Verification

"It runs" is not verification. Before calling Part A done, show me all of these:

1. A rule audit with one row per rule in the brief: the quoted rule, `file:line`, an order that exercises it, and pass or fail. Mark a rule as not exercised if no order reaches it. Never assume it works.
2. Hand-derived expected results for the tricky orders, worked from the brief and the data. Never copy an expected value from the script's output.
3. A mutation check: break one rule at a time, confirm that the tests or `routes.txt` change, and then restore the code.

Treat any claim or figure, mine, yours, or from the ops notes, as unverified until it's checked against the data. Say separately whether the code can do something and whether it actually happens in this data.

When you claim a bug, show the failing order and a similar order that passes. If a test exposes a bug, report it and don't bend the test to pass.
