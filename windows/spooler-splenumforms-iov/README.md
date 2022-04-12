
# Summary
I've found a memory corruption 0-day in windows spooler service in Oct, 2021. I did not report this vulnerability to Microsoft and leave it as 0-day but now vulnerability was patched on most recent Microsoft Patch Tuesday, April 12, 2022 i wanna disclose about this.

The vulnerability exists at `SplEnumForms` function of the `localspl.dll` file in which function has an integer overflow vulnerability, which leads to heap buffer underflow in the end. So it could leverage to escalate of privilege since windows spooler service has a SYSTEM privilege.


# Detail


```c
__int64 __fastcall SplEnumForms(__int64 a1, unsigned int Level, __int64 pForm, unsigned int cbBuf, unsigned int *a5, _DWORD *a6)
{
  ...
  result = ValidateSpoolHandle(a1, 0i64);
  if ( (_DWORD)result )
  {
  	...
  	v11 = *(_QWORD *)(a1 + 168);
    ...
    v13 = *(_QWORD **)(v11 + 72);
        do
        {
          v15 = 0i64;
          v16 = 0i64;
          if ( Level == 1 )
          {
            v32 = -1i64;
            do
              v18 = *(_WORD *)(v13[3] + 2 * v32++ + 2) == 0;
            while ( !v18 );
            length = 2 * v32 + 42;
          }
          else if ( Level == 2 )
          {
            v17 = -1i64;
            do
              v18 = *(_WORD *)(v13[3] + 2 * v17++ + 2) == 0;
            while ( !v18 );
            v19 = v13[9];
            length = 2 * v17 + 612;
            if ( v19 )
            {
              v21 = -1i64;
              do
                ++v21;
              while ( *(_BYTE *)(v19 + v21) );
              length += (((_BYTE)v21 + 1 + (_BYTE)length) & 1) + v21 + 1;
            }
            v22 = (const unsigned __int16 *)v13[10];
            if ( v22 )
            {
              ResourceNameID = GetResourceNameID(v22, &v35);
              v15 = ResourceNameID;
              if ( ResourceNameID )
              {
                v24 = -1i64;
                do
                  v18 = ResourceNameID[++v24] == 0;
                while ( !v18 );
                length += 2 * v24 + 2;
              }
            }
            if ( v13[11]
              && (ThreadUILanguage = GetThreadUILanguage(),
                  v26 = (struct _LANGPAIRNODE *)v13[11],
                  v37 = ThreadUILanguage,
                  (DisplayName = GetDisplayName(v26, ThreadUILanguage)) != 0i64)
              || (v33 = (unsigned __int16 *)v13[10]) != 0i64
              && (DisplayName = GetDisplayNameFromMuiDll(v33, &v37), (v16 = DisplayName) != 0i64) )
            {
              v28 = -1i64;
              do
                v18 = DisplayName[++v28] == 0;
              while ( !v18 );
              length += 2 * v28 + 2;
              ...
          }
          ...
          v13 = (_QWORD *)v13[1];
          total_length += length; <<< (1)
        }
        while ( v13 );
        v11 = v36;
      }
      *a5 = total_length;
      if ( total_length > (unsigned int)cbBuf ) <<< (2)
      {
        SetLastError(0x7Au);
        LeaveSplSem();
        return 0i64;
      }
      else
      {
        eof_pForm = &pForm[cbBuf];
        if ( v13 )
        {
          while ( 1 )
          {
            FormSize = GetFormSize((struct _INIFORM *)v13, Level);
            eof_pForm = CopyIniFormToFormInfo((struct _INIFORM *)v13, Level, pForm, FormSize, eof_pForm); <<< (3)
            if ( Level == 1 )
            {
              pForm += 40;
            }
            else if ( Level == 2 )
            {
              pForm += 88;
            }
            v13 = (_QWORD *)v13[1];
            if( !v13 )
            	goto ...
            ...
          return 0i64;
        }
  ...
  return result;
}
```

`SplEnumForms` function is invoked by `EnumForms` printer spooler api function. It enumerates forms that reserved in the printer object to show form information to the user. You can find detail infromation about `EnumForms` function at https://docs.microsoft.com/en-us/windows/win32/printdocs/enumforms. Microsoft have wrote documentation about that.

Let's see how 'SplEnumForms' function works. Take a look at `SplEnumForms` function code above (I skipped some lines for brevity), while iterating `v13` structure variable until next pointer isn't exist, the string fields of `v13` structure variable calculates their length and saves in `length` variable then `lenght` variable is added in `total_length` variable (1).

After iterating all of the `v13` structure variable then determines `total_length` variable, it checks at (2) whether `total_variable` is bigger than `cbBuf`. `cbBuf` is a size of `pForm` buffer, which is user-controllable size. As you might notice, `total_length` variable is unsigned int, it can be overflown thus (2) checks can be bypassed with a small size than `cbBuf`.

This arises problem since below `CopyIniFormToFormInfo` function (3) in while loop the `eof_pForm` buffer, which points to end of the buffer `pForm` will be copied with a form information and subtract `eof_pForm` buffer as it performs a copy operation until there is no next pointer of `v13` variable. 

So heap buffer underflow is occured due to a copy size for form informations is bigger than actual `pForm` buffer size - `cbBuf`

You can see this crash log by running attached [PoC](./splenumforms-iov-poc.c)

```
First chance exceptions are reported before any exception handling.
This exception may be expected and handled.
msvcrt!memcpy+0xa7:
00007ffa`ff1e4467 0f1100          movups  xmmword ptr [rax],xmm0 ds:00000000`030a8866=????????????????????????????????
0:008> kb
 # RetAddr           : Args to Child                                                           : Call Site
00 00007ff6`d70d256f : 00000000`030b2860 00000000`01406590 00000000`0176fdd0 00007ffa`ff17555c : msvcrt!memcpy+0xa7
01 00007ffa`dda51955 : 00000000`00000000 00000000`00000000 00000000`01787900 00000000`00000000 : spoolsv!PackStrings+0x9f
02 00007ffa`dd4bf0a8 : 00000000`00000000 00000000`030c4878 00000000`030b28b8 00000000`023eb540 : SPOOLSS!PackStrings+0x25
03 00007ffa`dd4becdf : 00000000`00000000 00000000`00000002 00000000`00000002 00000000`023eb540 : localspl!CopyIniFormToFormInfo+0x1d8
04 00007ff6`d70d49d4 : 00000000`01770409 00000000`00000002 00000000`030b0028 00000000`00017a18 : localspl!SplEnumForms+0x1ff
05 00007ffa`ffc98d23 : 00007ff6`d70d4800 00000000`00000002 00000000`030b0028 00000000`00017a18 : spoolsv!RpcEnumForms+0x1d4
06 00007ffa`ffcfd77b : 00000000`00ccf0d8 00007ff6`d714f1a0 00000000`0000000e 00007ff6`d7153fa0 : RPCRT4!Invoke+0x73
07 00007ffa`ffc7c9dc : 00007ff6`d7153100 00000000`00a7f2b0 00000000`00000000 00007ffa`ffc7e7fa : RPCRT4!Ndr64StubWorker+0xb0b
08 00007ffa`ffc79b58 : 00000000`00000001 00000000`00000002 00000000`00000002 00000000`00000000 : RPCRT4!NdrServerCallAll+0x3c
09 00007ffa`ffc59ff6 : 00007ffa`ffc7dbd0 00000000`00a94b80 00000000`00ccf560 00007ffb`0039b86b : RPCRT4!DispatchToStubInCNoAvrf+0x18
0a 00007ffa`ffc59948 : 00000000`00a94b80 00000000`00000001 00000000`00000000 00000000`00080000 : RPCRT4!RPC_INTERFACE::DispatchToStubWorker+0x1a6
0b 00007ffa`ffc6815f : 00000000`00000000 00000000`00ccf628 00000000`00b2ae70 00007ffb`003cbc21 : RPCRT4!RPC_INTERFACE::DispatchToStub+0xf8
0c 00007ffa`ffc67568 : 00000000`0001f990 00000000`00000001 00000000`00000000 00000000`00a7e190 : RPCRT4!LRPC_SCALL::DispatchRequest+0x31f
0d 00007ffa`ffc66b51 : 00000000`00000021 00000000`00aaa520 00000000`00000000 00000000`030b0000 : RPCRT4!LRPC_SCALL::HandleRequest+0x7f8
0e 00007ffa`ffc665be : 00000000`00000000 00000000`00000000 00000000`00000001 00000000`00a95860 : RPCRT4!LRPC_ADDRESS::HandleRequest+0x341
0f 00007ffa`ffc6ac92 : 00000000`024a1540 00000000`00b1e2a0 00000000`00a95968 00000000`00ccfb58 : RPCRT4!LRPC_ADDRESS::ProcessIO+0x89e
10 00007ffb`00390330 : 00000000`0245f1e0 00000000`00000001 00000000`00ccfb58 00000000`00000000 : RPCRT4!LrpcIoComplete+0xc2
11 00007ffb`003c2f26 : 00000000`00000000 00000000`00a60b00 00000000`00000000 00000000`00b5ed90 : ntdll!TppAlpcpExecuteCallback+0x260
12 00007ffa`ff597034 : 00000000`00000000 00000000`00000000 00000000`00000000 00000000`00000000 : ntdll!TppWorkerThread+0x456
13 00007ffb`003c2651 : 00000000`00000000 00000000`00000000 00000000`00000000 00000000`00000000 : KERNEL32!BaseThreadInitThunk+0x14
14 00000000`00000000 : 00000000`00000000 00000000`00000000 00000000`00000000 00000000`00000000 : ntdll!RtlUserThreadStart+0x21

```

