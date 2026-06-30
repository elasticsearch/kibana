---
navigation_title: "WSL on Windows Development"
description: "Learn how to setup a Windows development environment using WSL"
---

# Overview

Development on Windows is only supported through WSL2.  WSL lets users run a Linux environment on Windows, providing a supported development environment for Kibana with a much better experience and 
performance than the native one.

:::{note} Prerequisites
This guide allows you to achieve two different kind of experiences (Basic and Default each with their specifics). While we fully advise for upgrading into Windows 11 to use the much better Default experience (and will eventually remove the basic one from this guide), 
  for now both have a common prerequisite on enabling the hardware virtualization. 
  
  Get that feature to work will highly depend on your hardware, as it should be enabled on your UEFI (or BIOS). Please check the official Microsoft documentation on 
  [How to Enable Virtualization on Windows](https://support.microsoft.com/en-us/windows/enable-virtualization-on-windows-11-pcs-c5578302-6e43-4b4b-a449-8ced115f58e1).
  
  After successfully achieve the previous step there is a second good guide describing [How to Enable Hyper-V Platform Feature on Windows](https://docs.microsoft.com/en-us/virtualization/hyper-v-on-windows/quick-start/enable-hyper-v#enable-the-hyper-v-role-through-settings).
  
  Once hardware virtualization is enabled on Windows, please pay attention to the specific prerequisites for each type of experience listed below.
  
  ### Basic Experience
  For a basic WSL usage you must be running **Windows 10 version 2004 and higher (Build 19041 and higher) or Windows 11**. Note that in a basic setup you won't be able to use 
  the browser GUI to visually run and/or debug functional tests. It's highly advisable to make sure you install the prerequisites for a default usage listed below.
  
  **Note:** For a normal development cycle we really advise to use the default experience setup within Windows 11. However if you have an explicit need for using a browser GUI 
  while using Windows 10, please follow each step of the guide below applicable for the Basic Experience setup and then check our [short term workaround for Windows 10 GUI support](./wsl-on-windows-development.md#short-term-workaround-for-windows-10-gui-support).
  
  ### Default Experience
  For a default experience and a completion of the entire guide which will make you able to run GUI apps you must be running **Windows 11 (Build 22000 and higher)**.
  In addition to that, installing a **vGPU driver** is also required. Please choose the one compatible with your hardware: 

  - [Intel GPU driver for WSL](https://www.intel.com/content/www/us/en/download/19344/intel-graphics-windows-dch-drivers.html?)
  - [AMD GPU driver for WSL](https://www.amd.com/en/support/kb/release-notes/rn-rad-win-wsl-support)
  - [NVIDIA GPU driver for WSL](https://developer.nvidia.com/cuda/wsl) (**Note:** NVIDIA does now includes the vGPU driver in their common gpu drivers. Please make sure you have your latest available drivers installed or refer to the previous link for official documentation)
  
  More information for that could be found in the [official guide for GUI apps on WSL](https://docs.microsoft.com/en-us/windows/wsl/tutorials/gui-apps#install-support-for-linux-gui-apps).
:::

## Install WSL

The latest setup instructions can be found at https://docs.microsoft.com/en-us/windows/wsl/install

1. Open Powershell as an administrator

2. Install WSL with Ubuntu and restart the machine when prompted
```
wsl --install -d Ubuntu
```

   In case you already have WSL installed you can just `wsl --update` and then reboot the machine.

3. Once rebooted the installation will proceed for a new WSL install. If that's not the case make sure you're using 
   WSL2 and Ubuntu by
```
wsl --set-default-version 2
```

   and

```
wsl --set-default Ubuntu 
```

4. Install support for Google Chrome by running the following inside WSL shell **(IMPORTANT: [Default Experience Only](./wsl-on-windows-development.md#default-experience))**

   Start by updating your apt package sources list with
```
sudo apt update 
```

   Enter your user password, then
```
sudo apt -y upgrade && sudo apt -y autoremove 
cd /tmp
wget https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
sudo dpkg -i google-chrome-stable_current_amd64.deb
sudo apt install --fix-broken -y
sudo dpkg -i google-chrome-stable_current_amd64.deb
```

   Now you can launch Google Chrome by either `google-chrome` on your WSL shell or from Ubuntu Applications on Windows. 
  
   It's also worth it to check if there are other useful [GUI packages you would want to add on WSL](https://docs.microsoft.com/en-us/windows/wsl/tutorials/gui-apps#update-the-packages-in-your-distribution) and then the configuration is complete.

## Setup Kibana

The next step is now [setup your development environment](../getting-started/set-up-a-development-environment.md#get-the-code) for Kibana inside WSL just like in any other case.

## Install VSCode

Even though in previous steps you might have installed Nautilus and other X11 apps that allows you to use the file explorer for the WSL environment or even using some apps supported by X11 like 
Sublime Text our recommended way to write your code is by using VSCode installed natively on Windows and then use its remote development extension to connect into the WSL environment. You can do this 
by completing the following:

1. Install VSCode on Windows
2. Check the "Add to PATH" option during setup
3. Install the [Remote Development](https://code.visualstudio.com/docs/remote/wsl) package

For more information you can find the official documentation on how to Remote development is supported with an extension [here](https://code.visualstudio.com/docs/remote/wsl).

## Success

At this point you should be able to develop Kibana using WSL by writing code on VSCode, running commands for build, test and manage your dev environment using the WSL shell and finally having a basic GUI 
support for your WSL environment using the applications we recommended like Google Chrome and others you choose to install like for example Nautilus file manager or other X11 based ones.

## Short Term Workaround for Windows 10 GUI Support

As mentioned before is highly recommended you setup your environment for a default experience using Windows 11. If you're reading this section is because you are not available to do that for a reason and 
at the same time you still have the need for a GUI browser on Windows 10. Next you can find our recommendations for a short term workaround to achieve that for Windows 10 before we could terminate the support 
for this operating system.

1. Fulfil the [prerequisites for basic experience](./wsl-on-windows-development.md#basic-experience) as well as installing the [vGPU drivers from the default experience](./wsl-on-windows-development.md#default-experience). 

2. Make sure you've followed [Install WSL](./wsl-on-windows-development.md#install-wsl) up to step 3, [Setup Kibana](./wsl-on-windows-development.md#setup-kibana) and [Install VSCode](./wsl-on-windows-development.md#install-vscode).

3. Install Google Chrome and it's dependencies by
```
cd /tmp
sudo apt-get update
sudo apt-get install -y curl unzip xvfb libxi6 libgconf-2-4
wget https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
sudo apt install ./google-chrome-stable_current_amd64.deb
```
   
   Then run `google-chrome --version` and you should be able to get the current version installed printed out.

4. Download [VcXsrv](https://sourceforge.net/projects/vcxsrv) and install it natively on your **Windows**. Once installed go to the program files folder for VcXsrv and run `xlaunch.exe`. The majority of the default 
   settings are okay but make sure `Disable access control` is checked. In doubt, check the same settings as shown into this [Github issue image](https://github.com/microsoft/WSL/issues/4106#issuecomment-502920377). 
   Next, allow this application through the firewall if prompted when its first ran. Otherwise, if not asked, please go to `Windows firewall -> Allow an app through firewall -> click change settings -> select BOTH entries of "VcXsrv windows server" -> OK`.

5. Configure the `DISPLAY` env var which in Linux tells GUI applications at which IP address the X Server is running. On WSL2 the IP for the native Windows is not localhost, so we need 
   to set DISPLAY to the correct IP address. Let's go ahead and add the following into the `.bashrc` file of your WSL environment:
```
export DISPLAY=$(cat /etc/resolv.conf | grep nameserver | awk '{print $2; exit;}'):0.0
```
   Once complete, running `echo $DISPLAY` inside your WSL shell should print the Windows native IP suffixed by `:0.0`.

6. When reaching that point, if you run `google-chrome` on the WSL shell, the Chrome browser should open inside an X server window on Windows which should also work as expected when the functional tests chromedriver will try to use a browser to run into.

### Troubleshooting the workaround

#### Unable to open X display

If that is seen when running the Google Chrome

```
Error: /etc/machine-id contains 0 characters (32 were expected).
Unable to open X display
```

- Make sure VcXsrv is running in Windows with “Disable access control” checked.
- Make sure VcXsrv is whitelisted in the Windows firewall (search the start menu for “Allow a program through Windows firewall” and enable it there)

### More information

For more information on how to configure this alternative X server or to troubleshoot other problems please check 
the [official documentation](https://sourceforge.net/p/vcxsrv/wiki/VcXsrv%20%26%20Win10/) or a [popular Github issue](https://github.com/microsoft/WSL/issues/4106#issuecomment-502920377).