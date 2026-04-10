clear()

-- THE NEW WAY: Lua grabs the path directly from Windows
local appData = os.getenv("APPDATA")
local fullPath = appData .. "\\macropad-studio"

lmc_assign_keyboard('MY_MACROPAD')

lmc.minimizeToTray = true
lmc_minimize() 

lmc_set_handler('MY_MACROPAD', function(button, direction)
    if (direction == 0) then return end
    
    -- Write the file to %AppData%\macropad-studio\pressed_key.txt
    local filePath = fullPath .. "\\pressed_key.txt"
    local file = io.open(filePath, "w")
    if file then
        file:write(button)
        file:close()
    end
    
    lmc_send_keys('{F24}')
end)