// Shared, presentational body of the external participant access agreement.
//
// Rendered both in the public signing form (app/visit/[token]) and in the
// admin/president signed-agreement viewer (app/dashboard/visitor-agreements/[id])
// so the saved copy matches the agreed text exactly. This component renders the
// IMPORTANT LEGAL NOTICE box, the issuer/access header block, and the full
// §§1–15 legal text. The §15 acknowledgements render here as plain text list
// items; the interactive checkboxes live in the signing form right after this
// body, and the viewer renders them as checked items.

export const RELEASED_PARTIES =
  '“Released Parties” means The Board of Trustees of the Leland Stanford Junior University; ' +
  'Stanford University and all of its schools, departments, centers, institutes, programs, ' +
  'facilities, and other units; Stanford Student Robotics (SSR); the owners, operators, and ' +
  'managers of the Facilities; any other party affiliated, associated, or connected with any of ' +
  'the foregoing in relation to the Facilities or Activities; and each of their respective ' +
  'trustees, officers, faculty, staff, students, volunteers, agents, representatives, insurers, ' +
  'successors, and assigns.';

export const ACKNOWLEDGEMENTS = [
  'I have read every page, including the exhibits, before signing.',
  'I understand that I am giving up substantial legal rights, including the right to recover for a Released Party’s ordinary negligence.',
  'I understand the specific hazards of the Activities and have had the opportunity to ask questions.',
  'I have not relied on a statement inconsistent with this written Agreement.',
  'I have had sufficient time and the opportunity to consult a lawyer, parent, advisor, insurer, or other person of my choosing.',
  'I am signing freely and voluntarily and intend this Agreement to be as broad and inclusive as California law permits.',
  'I certify that I am at least 18 years old and that the information I provided is accurate.'
];

const sectionHeadingStyle: React.CSSProperties = {
  fontSize: '1.05rem',
  fontWeight: 700,
  margin: '1.6rem 0 0.5rem',
  color: '#171414'
};

const listStyle: React.CSSProperties = {
  margin: '0 0 0.6rem',
  paddingLeft: '1.2rem',
  lineHeight: 1.7
};

function Caps({ children }: { children: React.ReactNode }) {
  return <span style={{ fontWeight: 700 }}>{children}</span>;
}

export function VisitorContractBody({
  issuerName,
  accessStart,
  accessEnd
}: {
  issuerName: string;
  accessStart: string;
  accessEnd: string;
}) {
  return (
    <>
      <h1 style={{ fontSize: '1.6rem', lineHeight: 1.3, fontWeight: 800, margin: '0 0 1rem' }}>
        EXTERNAL PARTICIPANT ACCESS, ASSUMPTION OF RISK, RELEASE, INDEMNITY, AND EQUIPMENT
        RESPONSIBILITY AGREEMENT
      </h1>

      <div
        style={{
          border: '2px solid #8c1515',
          background: '#fbeeee',
          borderRadius: 10,
          padding: '0.9rem 1rem',
          margin: '0 0 1.25rem'
        }}
      >
        <strong style={{ display: 'block', marginBottom: '0.35rem', color: '#8c1515' }}>
          IMPORTANT LEGAL NOTICE
        </strong>
        <p style={{ margin: 0, fontWeight: 600 }}>
          THIS AGREEMENT AFFECTS LEGAL RIGHTS. IT INCLUDES AN ASSUMPTION OF RISK, A RELEASE OF
          CLAIMS INCLUDING CLAIMS BASED ON ORDINARY NEGLIGENCE, A COVENANT NOT TO SUE, AN INDEMNITY
          OBLIGATION, AND FINANCIAL RESPONSIBILITY FOR DAMAGE.
        </p>
      </div>

      <div
        style={{
          border: '1px solid #e0d4d4',
          background: '#faf7f7',
          borderRadius: 10,
          padding: '0.9rem 1rem',
          margin: '0 0 1.5rem'
        }}
      >
        <p style={{ margin: '0 0 0.35rem' }}>
          <strong>Issuing SSR President / Supervisor:</strong> {issuerName}
        </p>
        <p style={{ margin: 0 }}>
          <strong>Authorized access dates:</strong> {accessStart} – {accessEnd}
        </p>
      </div>

      <section style={{ marginTop: '0.5rem' }}>
        <p style={{ margin: '0 0 0.4rem' }}>
          In consideration of being allowed to enter, observe, meet, volunteer, collaborate, store
          or handle materials, or perform work in connection with SSR activities, the undersigned
          participant (“Participant”) agrees as follows:
        </p>

        <h2 style={sectionHeadingStyle}>1. Definitions and Scope</h2>
        <ul style={listStyle}>
          <li>
            “Facilities” means the SSR club room in the David Packard Electrical Engineering
            Building, the SSR bay in the Clubhouse for Hardware Innovation Projects (CHIP), and
            only those adjacent work, loading, testing, storage, hallway, or common areas
            expressly authorized in writing by the responsible facility manager.
          </li>
          <li>
            “Activities” means all access, observation, meetings, instruction, fabrication,
            assembly, repair, testing, operation, transport, storage, cleanup, and other
            participation related to SSR, whether supervised or unsupervised and whether occurring
            before, during, or after a scheduled session.
          </li>
          <li>
            “Equipment” means all tools, machines, robots, drones, vehicles, batteries, chargers,
            computers, test instruments, fixtures, materials, chemicals, prototypes, personal
            protective equipment, and other property owned, leased, borrowed, or controlled by
            Stanford University, SSR, another participant, or a third party.
          </li>
          <li>{RELEASED_PARTIES}</li>
        </ul>

        <h2 style={sectionHeadingStyle}>
          2. Eligibility; Voluntary Participation; No Status or Access Rights
        </h2>
        <p style={{ margin: '0 0 0.6rem' }}>
          Participant represents that Participant is at least eighteen (18) years old, is
          participating voluntarily, and is not relying on any promise of employment,
          compensation, academic credit, membership, admission, certification, or continued
          access. Participation does not make Participant a Stanford student, employee, agent,
          representative, or member of SSR. This Agreement grants no building, badge, key, network,
          data, intellectual-property, or equipment right. Access may be denied, limited,
          suspended, or revoked at any time, with or without cause.
        </p>

        <h2 style={sectionHeadingStyle}>3. Acknowledgment of Hazards</h2>
        <p style={{ margin: '0 0 0.6rem' }}>
          Participant understands that the Facilities and Activities may involve serious and
          unpredictable hazards, including hazards that cannot be eliminated without changing the
          nature of the Activities. Risks include, without limitation:
        </p>
        <ul style={listStyle}>
          <li>
            cuts, punctures, burns, crushing, pinching, entanglement, amputation, impact,
            projectile, eye, hearing, respiratory, and repetitive-strain injuries;
          </li>
          <li>
            electric shock, arc flash, short circuits, high current, stored energy, unexpected
            energization, fire, explosion, smoke, and toxic decomposition products;
          </li>
          <li>
            lithium and other batteries, including thermal runaway, venting, swelling, ignition,
            explosion, chemical exposure, and delayed fire;
          </li>
          <li>
            moving robots, propellers, rotors, actuators, wheels, belts, gears, springs, pressure
            systems, autonomous behavior, software faults, radio-control faults, and loss of
            control;
          </li>
          <li>
            hand tools, power tools, machine tools, soldering equipment, heat tools, 3D printers,
            lasers, CNC equipment, compressed gas, adhesives, epoxies, solvents, cleaners, paints,
            dust, fumes, and sharp or hot materials;
          </li>
          <li>
            heavy or falling objects, lifting, awkward work, trips, slips, falls, ladders, clutter,
            facility defects, inadequate lighting or ventilation, and the acts or omissions of
            other persons;
          </li>
          <li>
            equipment defects, improper assembly, inadequate guards, maintenance or inspection
            failures, incomplete instructions, negligent supervision, delayed emergency response,
            and the unavailability of medical assistance;
          </li>
          <li>
            damage, loss, theft, corruption, or disclosure of personal property, devices, software,
            files, credentials, prototypes, or data; and
          </li>
          <li>
            serious bodily injury, permanent disability, paralysis, disfigurement, illness, death,
            property damage, economic loss, and harm to third parties.
          </li>
        </ul>
        <p style={{ margin: '0 0 0.6rem' }}>
          Participant acknowledges that this list is illustrative rather than complete and that
          risks may be known or unknown, obvious or hidden, foreseeable or unforeseeable, and may
          arise from Participant, other participants, the condition of the premises, Equipment, or
          the acts or omissions of a Released Party.
        </p>

        <h2 style={sectionHeadingStyle}>4. Express Assumption of All Risks</h2>
        <p style={{ margin: '0 0 0.6rem' }}>
          <Caps>
            TO THE MAXIMUM EXTENT PERMITTED BY LAW, PARTICIPANT KNOWINGLY AND VOLUNTARILY ASSUMES
            ALL RISKS OF INJURY, ILLNESS, DEATH, LOSS, AND DAMAGE ARISING OUT OF OR RELATING TO THE
            FACILITIES, ACTIVITIES, EQUIPMENT, TRANSPORTATION, OR PARTICIPANT&apos;S PRESENCE ON
            STANFORD PROPERTY, INCLUDING RISKS CREATED OR CONTRIBUTED TO BY THE ORDINARY NEGLIGENCE
            OF ANY RELEASED PARTY.
          </Caps>{' '}
          Participant accepts full responsibility for deciding whether to participate, for stopping
          work when conditions appear unsafe, and for Participant&apos;s own conduct.
        </p>

        <h2 style={sectionHeadingStyle}>
          5. Release and Waiver of Claims, Including Ordinary Negligence
        </h2>
        <p style={{ margin: '0 0 0.6rem' }}>
          <Caps>
            TO THE MAXIMUM EXTENT PERMITTED BY LAW, PARTICIPANT, FOR PARTICIPANT AND
            PARTICIPANT&apos;S HEIRS, ESTATE, PERSONAL REPRESENTATIVES, EXECUTORS, ADMINISTRATORS,
            SUCCESSORS, AND ASSIGNS, IRREVOCABLY RELEASES, WAIVES, AND DISCHARGES EACH RELEASED
            PARTY FROM EVERY CLAIM, DEMAND, CAUSE OF ACTION, DAMAGE, LOSS, LIABILITY, COST, OR
            EXPENSE OF ANY KIND, WHETHER KNOWN OR UNKNOWN, SUSPECTED OR UNSUSPECTED, PRESENT OR
            FUTURE, ARISING OUT OF OR RELATING TO THE FACILITIES, ACTIVITIES, EQUIPMENT, OR
            PARTICIPANT&apos;S PRESENCE ON STANFORD PROPERTY.
          </Caps>
        </p>
        <p style={{ margin: '0 0 0.6rem' }}>
          This release expressly includes claims based on a Released Party&apos;s sole or
          concurrent <Caps>ORDINARY NEGLIGENCE</Caps>, including negligent instruction,
          supervision, training, selection, inspection, maintenance, repair, security, premises
          conditions, failure to warn, emergency response, or provision or use of Equipment. It
          applies regardless of whether injury or damage occurs before, during, or after an
          Activity.
        </p>
        <p style={{ margin: '0 0 0.6rem' }}>
          This Agreement is not intended to release liability that California law does not permit
          to be released, including liability finally determined to arise from gross negligence,
          recklessness, intentional misconduct, fraud, or a non-waivable violation of law. Any such
          non-waivable liability is excluded only to the minimum extent required by law.
        </p>

        <h2 style={sectionHeadingStyle}>
          6. Unknown Claims; California Civil Code Section 1542
        </h2>
        <p style={{ margin: '0 0 0.6rem' }}>
          Participant intends this release to apply to claims and consequences that Participant does
          not presently know or suspect. Participant acknowledges California Civil Code section
          1542, which states:
        </p>
        <blockquote
          style={{
            margin: '0 0 0.6rem',
            padding: '0.6rem 0.9rem',
            borderLeft: '3px solid #c9bcbc',
            background: '#faf7f7',
            fontStyle: 'italic'
          }}
        >
          “A general release does not extend to claims that the creditor or releasing party does
          not know or suspect to exist in his or her favor at the time of executing the release and
          that, if known by him or her, would have materially affected his or her settlement with
          the debtor or released party.”
        </blockquote>
        <p style={{ margin: '0 0 0.6rem' }}>
          To the maximum extent legally applicable, Participant expressly waives the protections of
          section 1542 and any similar law with respect to claims within the scope of this
          Agreement.
        </p>

        <h2 style={sectionHeadingStyle}>
          7. Covenant Not to Sue; Defense and Indemnification
        </h2>
        <p style={{ margin: '0 0 0.6rem' }}>
          Participant agrees not to initiate, assist, maintain, or voluntarily participate in any
          claim or proceeding against a Released Party concerning a claim released by this
          Agreement, except where such a covenant is prohibited by law.
        </p>
        <p style={{ margin: '0 0 0.6rem' }}>
          Participant shall defend, indemnify, and hold harmless the Released Parties from
          third-party claims, liabilities, judgments, penalties, losses, and reasonable costs,
          including reasonable attorneys&apos; fees, to the extent arising from or relating to
          Participant&apos;s acts or omissions, negligence, recklessness, intentional misconduct,
          rule violation, unauthorized access, improper use of Equipment, damage to property,
          injury to another person, or infringement or misuse of another person&apos;s property,
          data, or rights. This obligation does not require Participant to indemnify a Released
          Party for the portion of a loss finally determined to have been caused by that Released
          Party&apos;s gross negligence or intentional misconduct.
        </p>

        <h2 style={sectionHeadingStyle}>
          8. Equipment Authorization, Proper Use, and Financial Responsibility
        </h2>
        <ul style={listStyle}>
          <li>
            Participant may use only the specific Equipment and processes listed in Exhibit A and
            only after documented authorization and required training by the responsible
            shop/facility manager or designee.
          </li>
          <li>
            Participant shall follow all manufacturer instructions, safety procedures, posted
            rules, Stanford and facility policies, lockout/tagout requirements, PPE requirements,
            and instructions from supervisors.
          </li>
          <li>
            Participant shall not bypass guards, interlocks, limits, ventilation, access controls,
            software restrictions, or safety devices; modify, disassemble, repair, relocate, lend,
            remove, or allow another person to use Equipment; or introduce outside tools,
            batteries, chemicals, materials, code, radios, or devices without prior written
            approval.
          </li>
          <li>
            Before use, Participant shall inspect Equipment to the extent trained and immediately
            stop, secure, and report any defect, abnormal sound, heat, odor, vibration, damage,
            spill, incident, near miss, or unsafe condition.
          </li>
          <li>
            Participant is responsible for Equipment and access credentials placed in
            Participant&apos;s custody and shall protect them from loss, theft, misuse, and
            unauthorized access.
          </li>
        </ul>
        <p style={{ margin: '0 0 0.6rem' }}>
          Participant agrees to reimburse the lawful owner, through a Stanford-approved collection
          process, for the full reasonable and documented cost of inspection, diagnosis, cleanup,
          decontamination, recovery, repair, calibration, replacement with a substantially
          equivalent item, shipping, vendor labor, hazardous-material response, data restoration,
          and related facility damage to the extent caused by Participant&apos;s negligence,
          recklessness, intentional act, unauthorized access, improper use, failure to follow
          instructions, or violation of this Agreement. Ordinary wear, latent defects, and failures
          not caused or worsened by Participant are excluded. Loss or theft of property in
          Participant&apos;s custody is included to the extent caused by Participant&apos;s failure
          to exercise reasonable care.
        </p>
        <p style={{ margin: '0 0 0.6rem' }}>
          Participant shall report damage immediately and shall not conceal, alter, discard, reset,
          erase, or attempt an unapproved repair of damaged Equipment. Payment or reimbursement
          does not transfer ownership of damaged or replaced property.
        </p>

        <h2 style={sectionHeadingStyle}>9. Safety, Conduct, and Supervision Requirements</h2>
        <ul style={listStyle}>
          <li>
            No work while impaired by alcohol, cannabis, illegal drugs, medication, fatigue,
            illness, or any condition that could reduce safe judgment or coordination.
          </li>
          <li>
            No horseplay, practical jokes, fighting, weapons, open flames, smoking, vaping, or food
            or drink in prohibited areas.
          </li>
          <li>
            Required PPE must be worn and kept in serviceable condition. Participant shall not work
            alone when prohibited by facility rules or the supervisor.
          </li>
          <li>
            Visitors who are not authorized equipment users must remain escorted and outside
            restricted areas. Participant shall not admit, escort, or provide access to any other
            person without written approval.
          </li>
          <li>
            Participant shall keep work areas orderly, label and store materials correctly, dispose
            of waste as directed, and leave the Facilities and Equipment in a safe condition.
          </li>
          <li>
            Participant shall immediately report every injury, exposure, spill, fire, security
            issue, property loss, equipment malfunction, near miss, or policy violation and
            cooperate with emergency, safety, and incident-review procedures.
          </li>
          <li>
            Participant shall not photograph, copy, access, transmit, or disclose credentials,
            restricted information, private data, or another project&apos;s nonpublic materials
            without permission.
          </li>
        </ul>
        <p style={{ margin: '0 0 0.6rem' }}>
          Violation may result in immediate removal, revocation of access, reporting to
          Participant&apos;s home institution or appropriate authorities, financial responsibility,
          and any other lawful action.
        </p>

        <h2 style={sectionHeadingStyle}>
          10. Health, Medical Care, Insurance, and Personal Property
        </h2>
        <p style={{ margin: '0 0 0.6rem' }}>
          Participant represents that Participant is physically and mentally capable of safely
          performing the authorized Activities and will disclose to the responsible supervisor any
          limitation that requires a safety modification, without being required to disclose a
          diagnosis. Participant is responsible for maintaining appropriate health, accident, and
          personal liability insurance. Participant understands that the Released Parties do not
          provide Participant with medical, disability, workers&apos; compensation, property, or
          liability insurance merely because of participation.
        </p>
        <p style={{ margin: '0 0 0.6rem' }}>
          In an emergency, Participant authorizes reasonable first aid, emergency response,
          transport, and medical treatment when Participant is unable to consent, but acknowledges
          that no Released Party has a contractual duty to provide such care. Participant is
          responsible for medical and transport costs. Participant assumes the risk of loss, theft,
          damage, or contamination of Participant&apos;s personal property, subject to non-waivable
          law.
        </p>

        <h2 style={sectionHeadingStyle}>11. Compliance With Law and Stanford Requirements</h2>
        <p style={{ margin: '0 0 0.6rem' }}>
          Participant shall comply with all applicable laws and all current Stanford, Office of
          Student Engagement, Office of Risk Management and Insurance, Environmental Health &amp;
          Safety, building, facility, cybersecurity, emergency, and shop rules. Participant shall
          complete all required non-student registration, waivers, orientations, and
          equipment-specific training before participation. This Agreement does not authorize an
          activity otherwise prohibited by law or Stanford policy.
        </p>

        <h2 style={sectionHeadingStyle}>12. Term; Revocation; Return of Property</h2>
        <p style={{ margin: '0 0 0.6rem' }}>
          This Agreement applies during the dates listed above and to all related entries and
          Activities during that period. Access may be revoked immediately. Upon request or
          termination, Participant shall promptly return all Equipment, keys, badges, documents,
          materials, credentials, and other property; remove personal property as directed; and
          provide information reasonably needed to assess an incident or damage.
        </p>

        <h2 style={sectionHeadingStyle}>13. Governing Law; Severability; Construction</h2>
        <p style={{ margin: '0 0 0.6rem' }}>
          California law governs this Agreement, without regard to conflict-of-law rules. Any
          permitted action relating to this Agreement shall be brought in a court of competent
          jurisdiction in Santa Clara County, California, unless Stanford requires another forum. If
          any provision is held invalid or unenforceable, it shall be enforced to the maximum
          extent permitted and, if necessary, narrowed or severed without invalidating the
          remaining provisions. Headings are for convenience only. “Including” means “including
          without limitation.” This Agreement shall not be construed against a party merely because
          that party or its representative prepared it.
        </p>

        <h2 style={sectionHeadingStyle}>
          14. Entire Understanding; No Oral Modification; Electronic Signatures
        </h2>
        <p style={{ margin: '0 0 0.6rem' }}>
          Together with the current Stanford University Waiver, facility rules, and completed
          exhibits, this Agreement states the understanding concerning the subjects it covers. It
          may be changed only in a writing approved through Stanford&apos;s required process.
          Electronic signatures and counterparts may be treated as originals. Sections concerning
          release, covenant not to sue, indemnity, damage responsibility, governing law, and return
          of property survive expiration or termination.
        </p>

        <h2 style={sectionHeadingStyle}>15. Participant Acknowledgments</h2>
        <ul style={listStyle}>
          {ACKNOWLEDGEMENTS.map((text, index) => (
            <li key={index}>{text}</li>
          ))}
        </ul>
      </section>
    </>
  );
}
