/**
 * Builds the 10 synthetic NAA-style sample documents in samples/naa/.
 * Everything here is invented for testing. Agency names, authority numbers and
 * figures are fictional, except for the real Archives Act 1983 20-year access rule
 * (which replaced the old 30-year rule) that one document gets wrong on purpose.
 *
 * The registry manifest (09) stores SHA-256 fingerprints of the other documents as they
 * were REGISTERED. Document 03 is then edited afterwards, so its fingerprint no longer
 * matches. That is the planted "altered after registration" case.
 *
 * Run: node scripts/build-samples.mjs
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "samples", "naa");
mkdirSync(OUT, { recursive: true });
const sha = (s) => createHash("sha256").update(Buffer.from(s, "utf8")).digest("hex");

const NAA = "National Archives of Australia";

const docs = {};

docs["01-records-authority-2024-00561247.md"] = `Title: Records Authority 2024/00561247 - Grants administration (Regional Infrastructure)
Produced by: ${NAA}
Date: 2024-03-12
Status: Current
Type: Records Authority

# Records Authority 2024/00561247

Issued by the National Archives of Australia under the Archives Act 1983 to the Department of Regional Infrastructure and Cities (DRIC). It replaces Records Authority 2012/00127734 for grants administration records.

## Class 61.01 Grant application files
Applications, assessments and decision records for infrastructure grants.
Disposal action: Destroy 10 years after action completed.

## Class 61.02 Grant agreements and variations
Executed grant agreements, variations and acquittal reports.
Disposal action: Retain as national archives. Transfer to the National Archives when the records are 15 years old.

## Class 61.03 Routine grant correspondence
Administrative correspondence about grant enquiries and reminders.
Disposal action: Destroy 3 years after action completed.

## Access
Commonwealth records in the open access period become available for public access after 20 years under the Archives Act 1983, subject to access examination.
`;

docs["02-dric-retention-schedule-2021.md"] = `Title: DRIC Retention Schedule 2021
Produced by: DRIC Records Management Unit
Date: 2021-08-05
Status: Superseded
Type: Retention schedule

Prepared under Records Authority 2012/00127734. This schedule is replaced by Records Authority 2024/00561247.

## Grant application files
Retention: Destroy 7 years after action completed.

## Grant agreements and variations
Retention: Retain as national archives. Transfer to the National Archives when the records are 15 years old.

## Routine grant correspondence
Retention: Destroy 3 years after action completed.
`;

// 03 is written twice: the REGISTERED version (15 years) is hashed into the manifest,
// the version that ships (20 years) has been edited since.
const policyTemplate = (transferYears) => `Title: DRIC Information Management Policy v3
Produced by: DRIC Information Governance Branch
Date: 2024-09-01
Status: Current
Type: Policy

This policy applies to all DRIC staff and contractors. It operates under Records Authority 2024/00561247.

## Disposal
Grant application files are destroyed 10 years after action completed, as set out in Records Authority 2024/00561247.
Routine grant correspondence is destroyed 3 years after action completed.

## Transfer to the National Archives
Grant agreements and variations are retained as national archives and transferred to the National Archives when the records are ${transferYears} years old.

## Responsibilities
The Chief Information Officer is accountable for compliance. Branch managers make sure staff create and capture full and accurate records.
`;
const policyRegistered = policyTemplate(15);
docs["03-dric-information-management-policy-v3.md"] = policyTemplate(20);

docs["04-staff-records-guide-2022.md"] = `Title: Staff Records Guide 2022
Produced by: DRIC People and Culture
Date: 2022-05-17
Status: Current
Type: Guide

A short guide for DRIC staff on keeping records.

## How long do I keep grant files?
Grant application files are kept for 7 years after action completed, then destroyed.
Routine grant correspondence is kept for 3 years after action completed.

## When can the public see our records?
Records become open to the public after 30 years under the Archives Act.

Based on: DRIC Retention Schedule 2021.
`;

docs["05-intranet-records-faq-2023.html"] = `<!doctype html>
<html>
<head><title>Records FAQ</title></head>
<body>
<h1>Records FAQ</h1>
<p>Title: Intranet Records FAQ</p>
<p>Produced by: DRIC Intranet Team</p>
<p>Date: 2023-02-20</p>
<p>Status: Current</p>
<p>Type: FAQ</p>

<h2>How long are grant application files kept?</h2>
<p>Grant application files are kept for seven years after action completed. This follows Records Authority 2019/00334118.</p>

<h2>When do records become public?</h2>
<p>Commonwealth records are open to the public after 30 years.</p>
</body>
</html>
`;

docs["06-records-storage-cost-estimate-fy2024-25.md"] = `Title: Records Storage Cost Estimate FY2024-25
Produced by: DRIC Finance
Date: 2024-05-30
Status: Current
Type: Budget paper

## Storage cost estimate
The estimated cost of storing grant application files is $412,000 over the forward estimates.
This estimate assumes grant application files are destroyed 7 years after action completed.
`;

docs["07-records-transfer-register-2024.csv"] = `# Title: Records Transfer Register 2024
# Produced by: DRIC Records Management Unit
# Date: 2024-11-04
# Status: Current
# Type: Register
consignment,series,description,date_range,authority,status
TR-2022-014,GR-001,Grant agreements 2005-2009,2005-2009,2012/00127734,Transferred
TR-2023-007,GR-002,Grant agreements 2006-2010,2006-2010,2019/00334118,Transferred
TR-2024-003,GR-003,Grant agreements 2009-2012,2009-2012,2024/00561247,Pending
`;

docs["08-naa-authority-register-extract-2024.csv"] = `# Title: NAA Records Authority Register extract
# Produced by: ${NAA}
# Date: 2024-10-15
# Status: Current
# Type: Register
authority,title,agency,status,issued
2024/00561247,Grants administration (Regional Infrastructure),DRIC,Current,2024-03-12
2012/00127734,Grants administration,DRIC,Superseded,2012-06-20
2018/00402291,Property management,DRIC,Current,2018-09-03
`;

docs["10-series-description-native-welfare-1987.md"] = `Title: Series description: Native welfare correspondence, 1950-1975
Produced by: Department of Community Services (predecessor agency)
Date: 1987-03-02
Status: Current
Type: Series description

Series NW-1 contains correspondence about native welfare administration. Files relate to wards and their employment, and record the department's views on the progress of the assimilation policy.

Descriptions were written by the administering officers and reflect their view of events. No account from the people the records concern is included.
`;

// Write everything except the manifest, collecting registration hashes.
const registered = [];
for (const [file, text] of Object.entries(docs)) {
  writeFileSync(join(OUT, file), text, "utf8");
  const registeredText = file.startsWith("03-") ? policyRegistered : text;
  registered.push({ file, sha256: sha(registeredText) });
}

const manifest = {
  _meta: {
    title: "Document registry manifest",
    producedBy: "DRIC Records Management Unit",
    date: "2024-09-02",
    status: "Current",
    type: "Registry",
  },
  algorithm: "sha256",
  note: "Fingerprints recorded when each document was registered.",
  documents: registered.sort((a, b) => a.file.localeCompare(b.file)),
};
writeFileSync(join(OUT, "09-document-registry-manifest.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8");

console.log(`Wrote ${registered.length + 1} documents to ${OUT}`);
console.log("03 registered:", sha(policyRegistered).slice(0, 12), " shipped:", sha(docs["03-dric-information-management-policy-v3.md"]).slice(0, 12));
