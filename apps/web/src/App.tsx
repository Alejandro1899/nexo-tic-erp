import { Route, Routes } from "react-router-dom";
import { formatearMXN } from "@nexo/shared";

/** Base de la aplicación. Las pantallas reales llegan con sus historias de usuario. */
export function App() {
  return (
    <Routes>
      <Route
        path="*"
        element={
          <main style={{ fontFamily: "system-ui", padding: "2rem" }}>
            <h1>NEXO TIC ERP</h1>
            <p>Base del proyecto lista. Vista previa de cálculo: {formatearMXN(123456)}</p>
          </main>
        }
      />
    </Routes>
  );
}
