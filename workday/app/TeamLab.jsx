import { rolesFor } from "../lib/team";
export function TeamEvidence({ r }) {
  return (
    <section>
      <h3>台本の根拠になった回答</h3>
      {r.team.inputs.map((v, i) => (
        <details key={v.id}>
          <summary>
            {rolesFor(r.team.inputs.length, i)} ／ {v.code}・{v.title}
          </summary>
          <dl>
            {[
              ["実際の依頼", v.request],
              ["裁量", v.authority],
              ["実際に取った行動", v.action],
              ["実際の結果", v.outcome],
              ["判断が切り替わる条件", v.condition],
            ].map(([k, t]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{t}</dd>
              </div>
            ))}
          </dl>
        </details>
      ))}
    </section>
  );
}
