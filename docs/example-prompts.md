# Example Prompts — Writing Actuarial Scripts with the Local Model

A starter prompt library for using the local assistant to **write and modify actuarial model
scripts** (the UL / FIA / VA engines). The model answers grounded in your own code when
**Train on docs** has been run and **"Use trained knowledge"** is on.

> Setup: [running-the-project.md](running-the-project.md) · model choice: [changing-the-model.md](changing-the-model.md).

---

## How to get good answers

1. **Open the file** you're working on — it's auto-included (the amber *"in editor"* chip).
2. **Set the 🎯 target file** to the file you want code for.
3. **📎 Attach** related files the model needs to be consistent with (e.g. `inputs.py`,
   `config.py`), so it uses your real column names and assumptions.
4. Keep **"Use trained knowledge"** ticked so it pulls in the docs (`Model_specifications`,
   `architecture`, the API docs).
5. Use the **Insert into editor** / **Replace file** buttons on a reply to apply the code.

A small (3B) CPU model does best with **specific, scoped** asks. Prefer "add a lapse decrement to
the projection loop in `forward_projection.py`" over "improve the model."

---

## 1. Understand existing logic

- `Explain what forward_projection.py does, step by step, in plain English.`
- `Which assumptions does this projection read, and where do they come from? (attach inputs.py and config.py)`
- `Draw the data flow from loader.py → model.py → outputs.py as a bulleted list.`
- `What decrements are applied each projection period, and in what order?`
- `Summarise the reserve calculation in part3_cashflows.py and list every input it needs.`

## 2. Write new logic

- `Add a lapse decrement to the projection loop. Use a monthly lapse rate from the assumptions table, applied after mortality. Show the exact change for forward_projection.py.`
- `Write a function surrender_charge(policy_year, account_value) that returns the surrender charge using a declining schedule (year 1: 8% down to year 8: 0%). Match the style of utils.py.`
- `Add a cost-of-insurance (COI) deduction to the account-value roll-forward: COI = NAR × monthly COI rate. Keep the existing variable names.`
- `Implement a crediting-rate function for the FIA: annual point-to-point with a cap and a floor of 0%. Return a per-period credited rate.`
- `Add a guaranteed minimum death benefit (GMDB) = max(account value, total premiums paid) and use it in the death-benefit cashflow.`

## 3. Modify / refactor

- `Vectorise the per-policy projection loop in forward_projection.py with numpy so it runs over all policies at once. Preserve the outputs exactly.`
- `Refactor model.py so decrements (mortality, lapse, surrender) are pluggable functions passed into the projection, instead of hard-coded.`
- `Add a 'mode' switch so the engine can output either per-policy detail or a portfolio summary, matching the --mode flag in run_model.py.`
- `Parameterise the discount rate in part3_cashflows.py so it can be read from config.py instead of being a literal.`

## 4. Tests & validation

- `Write pytest unit tests for surrender_charge covering year 1, a mid-year, and year 9+ (should be 0).`
- `Add a sanity check that the sum of decrement rates in any period never exceeds 1.0, and raise a clear error if it does.`
- `Generate a small synthetic policy (single 45-year-old, $100k face) and assert the year-1 reserve is within an expected range.`
- `Write a reconciliation check that total benefit outgo + change in reserve ≈ premiums + investment income, and flag rows that break it.`

## 5. Debugging

- `This projection produces negative account values after year 20. Given forward_projection.py, what are the likely causes and the fix?`
- `The reserve in part3_cashflows.py is off by a factor of 12 vs the spec. Find the monthly/annual conversion bug.`
- `I'm getting a KeyError on 'lapse_rate'. Trace where assumptions are loaded (attach loader.py and inputs.py) and tell me what's missing.`

## 6. Documentation & spec alignment

- `Compare forward_projection.py against the Model_specifications doc and list any formulas that don't match.`
- `Write a docstring for each function in part3_cashflows.py describing inputs, outputs, and the actuarial formula used.`
- `Produce a short markdown table mapping each spec assumption to the variable that holds it in code.`

---

## Tips for the 3B CPU model

- **One change at a time.** Ask for a single function or a single edit, then apply it and iterate.
- **Name the file and the variables.** Attach the file so it reuses your real names instead of inventing them.
- **Ask it to show only the changed section,** not the whole file, to keep responses fast.
- **If an answer is generic,** it probably didn't retrieve context — confirm **Train on docs** ran and
  the relevant file is attached.
- For complex reserving / nested projections, the 3B model may struggle — that's where a 7B/14B
  coder on a stronger machine pays off ([changing-the-model.md](changing-the-model.md)).
