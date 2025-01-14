import { NavLink, Outlet } from "@remix-run/react";

function Settings() {
  const getClassName = (active: boolean) =>
    `block text-3xl ${
      active ? "text-primary" : "text-neutral-500"
    }  hover:text-primary py-3`;

  return (
    <>
      <div className="container relative pb-44">
        <div className="flex flex-col lg:flex-row -mx-4 pt-10 lg:pt-0">
          <div className="basis-4/12 px-4">
            <div className="px-4 py-8 lg:p-8 pb-15 rounded-lg bg-neutral-200 shadow-lg relative mb-8">
              <h3 className="font-bold mb-7">Projekt bearbeiten</h3>
              <menu>
                <ul>
                  <li>
                    <NavLink
                      to="general"
                      className={({ isActive }) => getClassName(isActive)}
                    >
                      Allgemein
                    </NavLink>
                  </li>
                  <li>
                    <NavLink
                      to="team"
                      className={({ isActive }) => getClassName(isActive)}
                    >
                      Team
                    </NavLink>
                  </li>
                  <li>
                    <NavLink
                      to="organizations"
                      className={({ isActive }) => getClassName(isActive)}
                    >
                      Verantwortliche Organisationen
                    </NavLink>
                  </li>
                </ul>
                <hr className="border-neutral-400 my-4 lg:my-8" />
                <div>
                  <NavLink
                    to="delete"
                    className={({ isActive }) => getClassName(isActive)}
                  >
                    Projekt löschen
                  </NavLink>
                </div>
              </menu>
            </div>
          </div>
          <div className="basis-6/12 px-4">
            <main>
              <Outlet />
            </main>
          </div>
        </div>
      </div>
    </>
  );
}

export default Settings;
