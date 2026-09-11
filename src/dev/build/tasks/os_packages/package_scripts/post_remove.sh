#!/bin/sh
set -e

REMOVE_DIRS=false
REMOVE_USER_AND_GROUP=false
REMOVE_KEYSTORE=false

case $1 in
  # Includes cases for all valid arguments, exit 1 otherwise
  # Debian
  purge)
    REMOVE_DIRS=true
    REMOVE_USER_AND_GROUP=true
    REMOVE_KEYSTORE=true
  ;;
  remove)
    REMOVE_DIRS=true
  ;;

  failed-upgrade|abort-install|abort-upgrade|disappear|upgrade|disappear)
  ;;

  # Red Hat
  0)
    REMOVE_USER_AND_GROUP=true
    REMOVE_KEYSTORE=true
    REMOVE_DIRS=true
  ;;

  1)
  ;;

  *)
    echo "post remove script called with unknown argument \`$1'" >&2
    exit 1
  ;;
esac

if [ "$REMOVE_DIRS" = "true" ]; then

  if [ -d "<%= logDir %>" ]; then
      echo -n "Deleting log directory..."
      rm -rf "<%= logDir %>"
      echo " OK"
  fi

  if [ -d "<%= pluginsDir %>" ]; then
    echo -n "Deleting plugins directory..."
    rm -rf "<%= pluginsDir %>"
    echo " OK"
  fi

  if [ -d "<%= pidDir %>" ]; then
      echo -n "Deleting PID directory..."
      rm -rf "<%= pidDir %>"
      echo " OK"
  fi

  if [ "$REMOVE_KEYSTORE" = "true" ]; then
    if [ -e "<%= configDir %>/kibana.keystore" ]; then
      echo -n "Deleting kibana.keystore..."
      rm -f "<%= configDir %>/kibana.keystore"
      echo "OK"
    fi
  fi

  if [ -d "<%= configDir %>" ]; then
    rm --force "<%= configDir %>"/kibana.keystore
    rmdir --ignore-fail-on-non-empty "<%= configDir %>"
  fi

  if [ -d "<%= dataDir %>" ]; then
    rmdir --ignore-fail-on-non-empty "<%= dataDir %>"
  fi
fi

if [ "$REMOVE_USER_AND_GROUP" = "true" ]; then
    if id <%= user %> > /dev/null 2>&1 ; then
        userdel <%= user %>
    fi

    if getent group <%= group %> > /dev/null 2>&1 ; then
        groupdel <%= group %>
    fi
fi
