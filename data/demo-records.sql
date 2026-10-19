-- Fictional demo source for the Database tab: sqlite://data/demo-records.db
-- Built from this file on first use. Ministerial Liaison's correspondence register.
CREATE TABLE ministerial_correspondence (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  owner TEXT NOT NULL,
  function TEXT NOT NULL,
  record_status TEXT NOT NULL,
  sent_at TEXT NOT NULL
);
INSERT INTO ministerial_correspondence VALUES
(1, 'Reply to constituent: eligibility for the flood grant',
 'Thank you for writing to the Minister about the Riverbend Flood Recovery Grant. Households with a combined annual income below $120,000 may be eligible for the grant. Applications close on 31 October 2026. The department has published the full guidelines on its website, and the grant hotline can help with an application.',
 'Ministerial Liaison', 'public_communications', 'final', '2026-06-08'),
(2, 'Reply to constituent: how much the grant pays',
 'Thank you for your letter about support after the February floods. The grant is paid in three tiers: $2,000 for contents, $5,000 for minor structural damage and $10,000 for major structural damage. An assessment officer decides the tier after reviewing photographs, receipts and, where needed, an inspection.',
 'Ministerial Liaison', 'public_communications', 'final', '2026-06-17'),
(3, 'Reply to local member: reports of a processing fee',
 'Thank you for raising constituents'' concerns about a notice asking for a processing fee. There is no fee to apply for the Riverbend Flood Recovery Grant or to have an application assessed. The department will never ask applicants to transfer money to any account, and anyone who receives such a request should report it to the grant hotline.',
 'Ministerial Liaison', 'public_communications', 'final', '2026-07-20');
