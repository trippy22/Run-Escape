param([Parameter(Mandatory=$true)][string]$Directory)
$ErrorActionPreference = 'Stop'
$identity = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
$acl = New-Object System.Security.AccessControl.DirectorySecurity
$acl.SetOwner($identity)
$acl.SetAccessRuleProtection($true, $false)
$inherit = [System.Security.AccessControl.InheritanceFlags]'ContainerInherit, ObjectInherit'
$propagate = [System.Security.AccessControl.PropagationFlags]::None
# Do not allow the key to be read through a Windows network share.
$network = New-Object System.Security.Principal.SecurityIdentifier('S-1-5-2')
$acl.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new($network, 'FullControl', $inherit, $propagate, 'Deny'))
foreach ($sid in @($identity, [System.Security.Principal.SecurityIdentifier]::new('S-1-5-18'))) {
    $acl.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new($sid, 'FullControl', $inherit, $propagate, 'Allow'))
}
[System.IO.Directory]::SetAccessControl($Directory, $acl)
