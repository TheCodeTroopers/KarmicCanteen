// src/context/AuthContext.js

import React, {
  createContext,
  useContext,
  useState,
  useEffect
} from 'react';

import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from 'firebase/auth';

import {
  doc
} from 'firebase/firestore';

import {
  getDocWithCache,
  getCachedDocument,
  docCacheKey
} from '../utils/indexedDbCache';

import {
  auth,
  db
} from '../firebase/config';


const AuthContext = createContext();


export const useAuth = () => {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error(
      'useAuth must be used within AuthProvider'
    );
  }

  return context;
};


export const AuthProvider = ({ children }) => {

  const [currentUser, setCurrentUser] = useState(null);

  const [userRole, setUserRole] = useState(null);

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState(null);


  useEffect(() => {

    console.log('AuthProvider initialized');


    const unsubscribe = onAuthStateChanged(
      auth,
      async (user) => {

        console.log(
          'Auth state changed:',
          user ? user.email : 'No user'
        );


        try {

          setError(null);


          if (user) {

            /*
             * --------------------------------------------------
             * USER IS AUTHENTICATED
             * --------------------------------------------------
             */

            setCurrentUser(user);

            console.log('Authenticated user:', {
              uid: user.uid,
              email: user.email
            });


            /*
             * --------------------------------------------------
             * FETCH USER ROLE FROM FIRESTORE
             *
             * Expected structure:
             *
             * users
             *   └── <Firebase Authentication UID>
             *         ├── email: "admin@example.com"
             *         └── role: "admin"
             * --------------------------------------------------
             */

            try {

              console.log(
                '========== ROLE DEBUG =========='
              );

              console.log(
                'Firebase UID:',
                user.uid
              );

              console.log(
                'User email:',
                user.email
              );


              const userRef = doc(
                db,
                'users',
                user.uid
              );


              console.log(
                'Firestore document path:',
                `users/${user.uid}`
              );


              // Read the role from Firestore when online; when the network is
              // unavailable, fall back to the locally cached role. Only the
              // role is cached (users/<uid> is stored as { role } — no
              // credentials or other sensitive data).
              const userDoc =
                await getDocWithCache(
                  userRef,
                  docCacheKey('users', user.uid),
                  {
                    sanitize: (data) => ({
                      role: data.role
                    })
                  }
                );


              console.log(
                'Firestore document exists:',
                userDoc.exists
              );


              if (userDoc.exists) {

                const userData = userDoc.data;


                console.log(
                  'Firestore user data:',
                  userData
                );


                const role = userData.role;


                console.log(
                  'Firestore user role:',
                  role
                );


                /*
                 * Make sure role is a string.
                 */
                if (
                  typeof role === 'string'
                ) {

                  let normalizedRole =
                    role.trim().toLowerCase();

                  if (normalizedRole === 'employee') {
                    normalizedRole = 'student';
                  }

                  console.log(
                    'Normalized role:',
                    normalizedRole
                  );


                  setUserRole(
                    normalizedRole
                  );

                } else {

                  console.warn(
                    'User role is missing or is not a string.'
                  );

                  setUserRole(null);
                }


              } else {

                console.warn(
                  'No Firestore user document found.'
                );

                console.warn(
                  'Expected document:',
                  `users/${user.uid}`
                );

                setUserRole(null);
              }


              console.log(
                '================================'
              );


            } catch (docError) {

              /*
               * ------------------------------------------------
               * FIRESTORE ERROR
               * ------------------------------------------------
               */

              console.error(
                '========== ROLE FETCH ERROR =========='
              );

              console.error(
                'Firebase UID:',
                user.uid
              );

              console.error(
                'User email:',
                user.email
              );

              console.error(
                'Error code:',
                docError?.code
              );

              console.error(
                'Error message:',
                docError?.message
              );

              console.error(
                'Full Firestore error:',
                docError
              );

              console.error(
                '======================================'
              );


              // If Firestore is unreachable, use the cached role so an
              // already signed-in user can still open the app offline.
              const cached =
                await getCachedDocument(
                  docCacheKey('users', user.uid)
                );

              if (
                cached &&
                typeof cached.role === 'string'
              ) {

                let cachedRole = cached.role.trim().toLowerCase();
                if (cachedRole === 'employee') {
                  cachedRole = 'student';
                }
                setUserRole(cachedRole);

              } else {

                setUserRole(null);

                setError(
                  docError?.message ||
                  'Could not fetch user role.'
                );
              }
            }


          } else {

            /*
             * --------------------------------------------------
             * NO USER
             * --------------------------------------------------
             */

            console.log(
              'No authenticated user.'
            );


            setCurrentUser(null);

            setUserRole(null);

            setError(null);
          }


        } catch (err) {

          console.error(
            '========== AUTH ERROR =========='
          );

          console.error(
            'Error code:',
            err?.code
          );

          console.error(
            'Error message:',
            err?.message
          );

          console.error(
            'Full error:',
            err
          );

          console.error(
            '================================'
          );


          setError(
            err?.message ||
            'Authentication error.'
          );

        } finally {

          /*
           * Authentication/role loading is finished.
           */
          setLoading(false);
        }

      },

      (authError) => {

        console.error(
          '========== AUTH STATE ERROR =========='
        );

        console.error(
          'Error code:',
          authError?.code
        );

        console.error(
          'Error message:',
          authError?.message
        );

        console.error(
          'Full error:',
          authError
        );

        console.error(
          '======================================='
        );


        setError(
          authError?.message ||
          'Authentication state error.'
        );

        setCurrentUser(null);

        setUserRole(null);

        setLoading(false);
      }
    );


    /*
     * ----------------------------------------------------------
     * AUTH LOADING TIMEOUT
     * ----------------------------------------------------------
     */

    const timeout = setTimeout(() => {

      if (loading) {

        console.warn(
          'Auth loading timeout - setting loading to false'
        );

        setLoading(false);
      }

    }, 10000);


    /*
     * ----------------------------------------------------------
     * CLEANUP
     * ----------------------------------------------------------
     */

    return () => {

      clearTimeout(timeout);

      unsubscribe();
    };

  }, []);


  /*
   * ------------------------------------------------------------
   * LOGIN
   * ------------------------------------------------------------
   */

  const login = async (
    email,
    password
  ) => {

    console.log(
      'Attempting login for:',
      email
    );

    try {

      const result =
        await signInWithEmailAndPassword(
          auth,
          email,
          password
        );

      console.log(
        'Firebase Authentication successful:',
        {
          uid: result.user.uid,
          email: result.user.email
        }
      );

      return result;

    } catch (loginError) {

      console.error(
        '========== LOGIN ERROR =========='
      );

      console.error(
        'Error code:',
        loginError?.code
      );

      console.error(
        'Error message:',
        loginError?.message
      );

      console.error(
        'Full login error:',
        loginError
      );

      console.error(
        '================================='
      );

      throw loginError;
    }
  };


  /*
   * ------------------------------------------------------------
   * LOGOUT
   * ------------------------------------------------------------
   */

  const logout = async () => {

    console.log(
      'Logging out user'
    );

    try {

      await signOut(auth);

      console.log(
        'Logout successful'
      );

    } catch (logoutError) {

      console.error(
        'Logout error:',
        logoutError
      );

      throw logoutError;
    }
  };


  /*
   * ------------------------------------------------------------
   * CONTEXT VALUE
   * ------------------------------------------------------------
   */

  const value = {

    currentUser,

    userRole,

    loading,

    error,

    login,

    logout
  };


  /*
   * ------------------------------------------------------------
   * PROVIDER
   * ------------------------------------------------------------
   */

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};