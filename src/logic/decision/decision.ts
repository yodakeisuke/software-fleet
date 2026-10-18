// --- public interface
export const Decision = {
  id: (now: number) => id(now),
}

// --- business rules
// 決定の id は、記録した時刻から作る
const id = (now: number) => `decision-${now}`
