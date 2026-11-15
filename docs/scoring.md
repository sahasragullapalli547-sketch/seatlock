# Explainable suggestions

Suggestions return a weighted score: skill complement is 50%, timezone overlap
is 35%, and availability/fit is 15%. A missing skill category scores 100,
duplicate-only skills score 35, and candidates already in a membership score
zero for fit. The production scoring contract keeps the factors separate in
the response so a user can see why a candidate ranked where they did.
